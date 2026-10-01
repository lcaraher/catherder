"""Forwards mail SES received at the feedback address, or sends a notice when it cannot."""

import datetime
import email.policy
import json
import os
import urllib.parse
from dataclasses import dataclass
from email.headerregistry import Address
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses

REGION = "us-east-2"
MAX_FORWARD_BYTES = 39_000_000
DONE_TAGS = ("forwarded", "notified", "dropped")
VERDICTS = ("spam", "virus", "spf", "dkim", "dmarc")

# Copied from https://docs.aws.amazon.com/ses/latest/dg/attachments.html
BLOCKED_EXTENSIONS = frozenset({
    ".ade", ".adp", ".app", ".asp", ".bas", ".bat", ".cer", ".chm", ".cmd", ".com",
    ".cpl", ".crt", ".csh", ".der", ".exe", ".fxp", ".gadget", ".hlp", ".hta", ".inf",
    ".ins", ".isp", ".its", ".js", ".jse", ".ksh", ".lib", ".lnk", ".mad", ".maf",
    ".mag", ".mam", ".maq", ".mar", ".mas", ".mat", ".mau", ".mav", ".maw", ".mda",
    ".mdb", ".mde", ".mdt", ".mdw", ".mdz", ".msc", ".msh", ".msh1", ".msh2", ".mshxml",
    ".msh1xml", ".msh2xml", ".msi", ".msp", ".mst", ".ops", ".pcd", ".pif", ".plg", ".prf",
    ".prg", ".reg", ".scf", ".scr", ".sct", ".shb", ".shs", ".sys", ".ps1", ".ps1xml",
    ".ps2", ".ps2xml", ".psc1", ".psc2", ".tmp", ".url", ".vb", ".vbe", ".vbs", ".vps",
    ".vsmacros", ".vss", ".vst", ".vsw", ".vxd", ".ws", ".wsc", ".wsf", ".wsh", ".xnk",
})

# Removed from forwarded mail; X-SES-* headers are removed by prefix.
REMOVED_HEADERS = ("Return-Path", "Sender", "Bcc", "DKIM-Signature", "DomainKey-Signature")

# CRLF line endings, and headers left unchanged go out exactly as they arrived.
OUTPUT_POLICY = email.policy.SMTP.clone(refold_source="none")

REASONS = {
    "held_dmarc": "It failed the sending domain's DMARC check, so it may not be from who it says it is.",
    "held_unscanned": "SES could not finish scanning it for spam and viruses.",
    "malformed": "It is badly formed, so it could not be forwarded safely.",
    "blocked_attachment": "It has an attachment type SES will not send: {files}.",
    "too_large": "It is too large to forward ({size:,} bytes; the limit is 39,000,000).",
    "refused": "SES refused to send it on ({code}).",
}
HELD = ("held_dmarc", "held_unscanned")

_clients = {}


class MailError(Exception):
    """Raised in place of an error whose message could hold an address."""


@dataclass(frozen=True)
class Config:
    feedback_address: str
    forward_to: list
    bucket: str
    prefix: str
    configuration_set: str
    stored_mail_days: int

    @classmethod
    def from_env(cls):
        return cls(
            feedback_address=os.environ["FEEDBACK_ADDRESS"],
            forward_to=[a.strip() for a in os.environ["FORWARD_TO"].split(",") if a.strip()],
            bucket=os.environ["MAIL_BUCKET"],
            prefix=os.environ["MAIL_PREFIX"],
            configuration_set=os.environ["CONFIGURATION_SET"],
            stored_mail_days=int(os.environ["STORED_MAIL_DAYS"]),
        )


def client(name):
    # boto3 is imported on first use so tests run without it.
    if name not in _clients:
        import boto3

        _clients[name] = boto3.client(name, region_name=REGION)
    return _clients[name]


def error_code(err):
    response = getattr(err, "response", None)
    if isinstance(response, dict):
        return response.get("Error", {}).get("Code", "")
    return ""


def log(entry):
    print(json.dumps(entry, separators=(",", ":")))


def one_line(value):
    return " ".join(str(value).split())


def get_tags(cfg, key):
    response = client("s3").get_object_tagging(Bucket=cfg.bucket, Key=key)
    return {tag["Key"]: tag["Value"] for tag in response.get("TagSet", [])}


def put_tags(cfg, key, tags, **new):
    # PutObjectTagging replaces the whole set, so existing tags are written back.
    merged = {**tags, **new}
    client("s3").put_object_tagging(
        Bucket=cfg.bucket,
        Key=key,
        Tagging={"TagSet": [{"Key": k, "Value": v} for k, v in merged.items()]},
    )


def send_raw(cfg, data):
    response = client("sesv2").send_email(
        FromEmailAddress=cfg.feedback_address,
        Destination={"ToAddresses": list(cfg.forward_to)},
        Content={"Raw": {"Data": data}},
        ConfigurationSetName=cfg.configuration_set,
    )
    return response["MessageId"]


def send_text(cfg, subject, body, marker):
    message = EmailMessage(policy=OUTPUT_POLICY)
    message["From"] = Address(addr_spec=cfg.feedback_address)
    message["To"] = [Address(addr_spec=a) for a in cfg.forward_to]
    message["Subject"] = one_line(subject)
    message["X-Catherder-Forwarded"] = marker
    message.set_content(body)
    return send_raw(cfg, message.as_bytes())


def stored_until(received, days):
    return (received + datetime.timedelta(days=days)).date().isoformat()


def retrieval_lines(cfg, key, message_id, until, warn):
    """Lines telling a reader where the stored message is and how to fetch it."""
    url = (
        f"https://{REGION}.console.aws.amazon.com/s3/object/{cfg.bucket}"
        f"?region={REGION}&prefix={urllib.parse.quote(key, safe='/')}"
    )
    lines = [
        f"Stored until {until} at s3://{cfg.bucket}/{key}",
        "",
        "To read it in the AWS console, sign in as a user allowed to read stored mail, "
        f"open {url} and choose Download, then open the file in Thunderbird. "
        "It is the message exactly as it arrived.",
    ]
    if warn:
        lines.append("Don't open its attachments.")
    lines += [
        "",
        "Or from a terminal with your AWS profile set:",
        f"aws s3 cp s3://{cfg.bucket}/{key} {message_id}.eml --region {REGION} --no-cli-pager",
    ]
    return lines


def header_map(mail):
    headers = {}
    for header in mail.get("headers", []):
        headers.setdefault(header.get("name", "").lower(), []).append(header.get("value", ""))
    return headers


def drop_reason(mail, verdicts, cfg):
    if verdicts["virus"] == "FAIL":
        return "virus"
    if verdicts["spam"] == "FAIL":
        return "spam"
    source = mail.get("source", "")
    if not source or source.upper().startswith("MAILER-DAEMON"):
        return "loop"
    headers = header_map(mail)
    if any(value.strip().lower() != "no" for value in headers.get("auto-submitted", [])):
        return "loop"
    if "x-catherder-forwarded" in headers:
        return "loop"
    feedback = cfg.feedback_address.lower()
    feedback_domain = feedback.rpartition("@")[2]
    for _, address in getaddresses(mail.get("commonHeaders", {}).get("from", [])):
        address = address.lower()
        if address == feedback or address.rpartition("@")[2] == feedback_domain:
            return "loop"
    return None


def hold_reason(verdicts):
    if verdicts["dmarc"] == "FAIL":
        return "held_dmarc"
    if "PROCESSING_FAILED" in (verdicts["spam"], verdicts["virus"]):
        return "held_unscanned"
    return None


def malformed_defects(message):
    """Names of what makes the message badly formed; empty when it is not."""
    defects = sorted({type(defect).__name__ for part in message.walk() for defect in part.defects})
    if defects:
        return defects
    try:
        from_headers = message.get_all("From") or []
        if len(from_headers) == 1 and from_headers[0].addresses:
            return []
    except Exception:
        pass
    return ["missing_or_multiple_from"]


def blocked_files(message):
    names = []
    for part in message.walk():
        name = part.get_filename()
        if not name:
            continue
        clean = name.strip().rstrip(".").lower()
        if "." in clean and "." + clean.rpartition(".")[2] in BLOCKED_EXTENSIONS:
            names.append(one_line(name))
    return names


def rebuild(message, message_id, cfg):
    """Changes headers only; every MIME part is left as it arrived."""
    sender = message["From"].addresses
    name = one_line(sender[0].display_name or sender[0].addr_spec)
    reply_to = message["Reply-To"]
    to = message.get_all("To") or []
    cc = message.get_all("Cc") or []
    original_id = message["Message-ID"]

    for header in REMOVED_HEADERS + ("From", "Reply-To", "To", "Cc", "Message-ID"):
        del message[header]
    for header in {h for h in message.keys() if h.lower().startswith("x-ses-")}:
        del message[header]

    message["From"] = Address(display_name=f"{name} via catherder feedback", addr_spec=cfg.feedback_address)
    message["Reply-To"] = list(sender)
    message["To"] = [Address(addr_spec=a) for a in cfg.forward_to]
    if reply_to is not None:
        message["X-Original-Reply-To"] = one_line(reply_to)
    for value in to:
        message["X-Original-To"] = one_line(value)
    for value in cc:
        message["X-Original-Cc"] = one_line(value)
    if original_id is not None:
        message["X-Original-Message-ID"] = one_line(original_id)
    message["X-Catherder-Forwarded"] = message_id
    return message.as_bytes(policy=OUTPUT_POLICY)


def notice_body(reason, detail, mail, cfg, key):
    common = mail.get("commonHeaders", {})
    message_id = mail["messageId"]
    received = datetime.datetime.fromisoformat(mail["timestamp"])
    lines = [
        REASONS[reason].format(**detail),
        "",
        f"From: {one_line(', '.join(common.get('from', [])))}",
        f"Subject: {one_line(common.get('subject', ''))}",
        f"Date: {one_line(common.get('date', ''))}",
        f"SES message id: {message_id}",
        "",
    ]
    lines += retrieval_lines(cfg, key, message_id, stored_until(received, cfg.stored_mail_days), reason in HELD)
    return "\n".join(lines) + "\n"


def notify(cfg, mail, key, tags, reason, **detail):
    subject = one_line(mail.get("commonHeaders", {}).get("subject", ""))[:100]
    send_text(
        cfg,
        f"[catherder mail] Not forwarded: {subject}",
        notice_body(reason, detail, mail, cfg, key),
        mail["messageId"],
    )
    put_tags(cfg, key, tags, notified=reason)


def process(record, cfg):
    mail = record["mail"]
    receipt = record["receipt"]
    message_id = mail["messageId"]
    key = cfg.prefix + message_id
    verdicts = {name: receipt.get(f"{name}Verdict", {}).get("status", "") for name in VERDICTS}
    entry = {"messageId": message_id, **verdicts}

    tags = get_tags(cfg, key)
    if any(tag in tags for tag in DONE_TAGS):
        log({**entry, "action": "skipped_done"})
        return

    dropped = drop_reason(mail, verdicts, cfg)
    if dropped:
        put_tags(cfg, key, tags, dropped=dropped)
        log({**entry, "action": f"dropped_{dropped}"})
        return

    held = hold_reason(verdicts)
    if held:
        notify(cfg, mail, key, tags, held)
        log({**entry, "action": "notified", "reason": held})
        return

    raw = client("s3").get_object(Bucket=cfg.bucket, Key=key)["Body"].read()
    entry["size"] = len(raw)
    message = BytesParser(policy=email.policy.default).parsebytes(raw)

    defects = malformed_defects(message)
    if defects:
        notify(cfg, mail, key, tags, "malformed")
        log({**entry, "action": "notified", "reason": "malformed", "defects": defects})
        return

    blocked = blocked_files(message)
    if blocked:
        notify(cfg, mail, key, tags, "blocked_attachment", files=", ".join(blocked))
        log({**entry, "action": "notified", "reason": "blocked_attachment"})
        return

    data = rebuild(message, message_id, cfg)
    entry["size"] = len(data)
    if len(data) > MAX_FORWARD_BYTES:
        notify(cfg, mail, key, tags, "too_large", size=len(data))
        log({**entry, "action": "notified", "reason": "too_large"})
        return

    try:
        ses_id = send_raw(cfg, data)
    except Exception as err:
        code = error_code(err)
        if code != "MessageRejected":
            raise
        notify(cfg, mail, key, tags, "refused", code=code)
        log({**entry, "action": "notified", "reason": "refused"})
        return

    put_tags(cfg, key, tags, forwarded=ses_id)
    log({**entry, "action": "forwarded"})


def lambda_handler(event, context):
    cfg = Config.from_env()
    for record in event.get("Records", []):
        try:
            process(record["ses"], cfg)
        except Exception as err:
            # The original error is not chained: its message may hold an address.
            raise MailError(one_line(f"{type(err).__name__} {error_code(err)}")) from None
