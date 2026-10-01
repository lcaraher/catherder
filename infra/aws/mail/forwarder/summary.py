"""Sends one email a day listing stored mail that was dropped and not yet summarized."""

import datetime
import email.policy
from email.parser import BytesParser

import handler

# Enough for the headers of any ordinary message; the body is never read.
HEADER_BYTES = 65536

WHY = {
    "spam": "SES marked it as spam.",
    "virus": "SES found a virus in it.",
    "loop": "A loop guard stopped it, such as an auto-reply or a bounce.",
}


def header_value(headers, name):
    try:
        value = headers[name]
    except Exception:
        return "(unreadable)"
    return handler.one_line(value) if value is not None else "(none)"


def read_headers(cfg, key):
    response = handler.client("s3").get_object(
        Bucket=cfg.bucket, Key=key, Range=f"bytes=0-{HEADER_BYTES - 1}"
    )
    data = response["Body"].read()
    return BytesParser(policy=email.policy.default).parsebytes(data, headersonly=True)


def find_entries(cfg):
    entries = []
    paginator = handler.client("s3").get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=cfg.bucket, Prefix=cfg.prefix):
        for item in page.get("Contents", []):
            key = item["Key"]
            tags = handler.get_tags(cfg, key)
            if "dropped" not in tags or "summarized" in tags:
                continue
            headers = read_headers(cfg, key)
            entries.append({
                "key": key,
                "message_id": key[len(cfg.prefix):],
                "tags": tags,
                "why": tags["dropped"],
                "from": header_value(headers, "From"),
                "subject": header_value(headers, "Subject"),
                "date": header_value(headers, "Date"),
                "until": handler.stored_until(item["LastModified"], cfg.stored_mail_days),
            })
    return entries


def summary_body(cfg, entries):
    lines = []
    for number, entry in enumerate(entries, start=1):
        lines += [
            f"{number}. {WHY.get(entry['why'], 'It was dropped.')}",
            f"From: {entry['from']}",
            f"Subject: {entry['subject']}",
            f"Date: {entry['date']}",
        ]
        lines += handler.retrieval_lines(
            cfg, entry["key"], entry["message_id"], entry["until"], entry["why"] == "virus"
        )
        lines.append("")
    return "\n".join(lines)


def summarize(cfg):
    entries = find_entries(cfg)
    if entries:
        today = datetime.datetime.now(datetime.UTC).date().isoformat()
        handler.send_text(
            cfg,
            f"[catherder mail] Daily summary: {len(entries)} not forwarded",
            summary_body(cfg, entries),
            f"summary-{today}",
        )
        for entry in entries:
            handler.put_tags(cfg, entry["key"], entry["tags"], summarized=today)
    handler.log({"count": len(entries)})


def summary_handler(event, context):
    cfg = handler.Config.from_env()
    try:
        summarize(cfg)
    except Exception as err:
        # The original error is not chained: its message may hold an address.
        raise handler.MailError(handler.one_line(f"{type(err).__name__} {handler.error_code(err)}")) from None
