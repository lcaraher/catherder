import base64
import contextlib
import datetime
import io
import json
import os
import unittest
from email import policy
from email.parser import BytesParser
from unittest import mock

import handler

FEEDBACK = "feedback@example.net"
FORWARD_TO = "forward-to@example.com"
SENDER = "sender@example.org"
SENDER_NAME = "Sample Sender"
REPLY = "replies@example.org"
TO = "list@example.org"
CC = "copy@example.org"
BUCKET = "test-mail-bucket"
PREFIX = "inbound/"
SUBJECT = "Feedback about the schedule page"

ENV = {
    "FEEDBACK_ADDRESS": FEEDBACK,
    "FORWARD_TO": FORWARD_TO,
    "MAIL_BUCKET": BUCKET,
    "MAIL_PREFIX": PREFIX,
    "CONFIGURATION_SET": "test-set",
    "STORED_MAIL_DAYS": "30",
}

PDF_BYTES = b"%PDF-1.4\n" + bytes(range(256)) * 4 + b"\n%%EOF\n"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + bytes(range(255, -1, -1)) * 3


class FakeClientError(Exception):
    def __init__(self, code):
        super().__init__(f"{code}: refused for {SENDER}")
        self.response = {"Error": {"Code": code, "Message": f"refused for {SENDER}"}}


class FakeBody:
    def __init__(self, data):
        self.data = data

    def read(self):
        return self.data


class FakePaginator:
    def __init__(self, s3):
        self.s3 = s3

    def paginate(self, Bucket, Prefix):
        contents = [
            {"Key": key, "LastModified": item["last_modified"]}
            for key, item in sorted(self.s3.objects.items())
            if key.startswith(Prefix)
        ]
        yield {"Contents": contents} if contents else {}


class FakeS3:
    def __init__(self):
        self.objects = {}
        self.get_calls = []
        self.tag_writes = []

    def add(self, key, data, tags=None, last_modified=None):
        self.objects[key] = {
            "data": data,
            "tags": dict(tags or {}),
            "last_modified": last_modified or datetime.datetime(2026, 10, 1, 12, tzinfo=datetime.UTC),
        }

    def get_object(self, Bucket, Key, Range=None):
        self.get_calls.append({"Key": Key, "Range": Range})
        data = self.objects[Key]["data"]
        if Range:
            start, end = Range.removeprefix("bytes=").split("-")
            data = data[int(start): int(end) + 1]
        return {"Body": FakeBody(data)}

    def get_object_tagging(self, Bucket, Key):
        tags = self.objects[Key]["tags"]
        return {"TagSet": [{"Key": k, "Value": v} for k, v in tags.items()]}

    def put_object_tagging(self, Bucket, Key, Tagging):
        tags = {tag["Key"]: tag["Value"] for tag in Tagging["TagSet"]}
        self.objects[Key]["tags"] = tags
        self.tag_writes.append((Key, tags))

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return FakePaginator(self)


class FakeSes:
    def __init__(self):
        self.sent = []
        self.fail_with = []

    def send_email(self, **kwargs):
        self.sent.append(kwargs)
        if self.fail_with:
            raise FakeClientError(self.fail_with.pop(0))
        return {"MessageId": f"ses-out-{len(self.sent)}"}

    def messages(self):
        return [BytesParser(policy=policy.default).parsebytes(s["Content"]["Raw"]["Data"]) for s in self.sent]


def crlf(text):
    return text.replace("\n", "\r\n").encode()


def plain_message(extra_headers="", subject=SUBJECT, from_header=f"{SENDER_NAME} <{SENDER}>"):
    return crlf(
        "Return-Path: <bounce@example.org>\n"
        "X-SES-Spam-Verdict: PASS\n"
        "X-SES-Receipt: AEFBQUFBQUFBQUFH\n"
        "DKIM-Signature: v=1; a=rsa-sha256; d=example.org; s=s1; b=abc\n"
        f"From: {from_header}\n"
        f"Reply-To: {REPLY}\n"
        f"To: {TO}\n"
        f"Cc: {CC}\n"
        f"Bcc: hidden@example.org\n"
        "Sender: agent@example.org\n"
        f"Subject: {subject}\n"
        "Date: Thu, 1 Oct 2026 12:00:00 +0000\n"
        "Message-ID: <original-1@example.org>\n"
        "MIME-Version: 1.0\n"
        "Content-Type: text/plain; charset=utf-8\n"
        f"{extra_headers}"
        "\n"
        "Hello,\n"
        "the schedule page is great.\n"
    )


def b64_lines(data):
    encoded = base64.b64encode(data).decode()
    return "\n".join(encoded[i: i + 76] for i in range(0, len(encoded), 76))


def attachment_message(filename="report.pdf"):
    return crlf(
        f"From: {SENDER_NAME} <{SENDER}>\n"
        f"To: {TO}\n"
        f"Subject: {SUBJECT}\n"
        "Date: Thu, 1 Oct 2026 12:00:00 +0000\n"
        "Message-ID: <original-2@example.org>\n"
        "MIME-Version: 1.0\n"
        'Content-Type: multipart/mixed; boundary="outer"\n'
        "\n"
        "--outer\n"
        'Content-Type: multipart/related; boundary="inner"\n'
        "\n"
        "--inner\n"
        "Content-Type: text/html; charset=utf-8\n"
        "\n"
        '<p>Logo: <img src="cid:logo@example.org"></p>\n'
        "--inner\n"
        "Content-Type: image/png\n"
        "Content-Transfer-Encoding: base64\n"
        "Content-ID: <logo@example.org>\n"
        'Content-Disposition: inline; filename="logo.png"\n'
        "\n"
        f"{b64_lines(PNG_BYTES)}\n"
        "--inner--\n"
        "\n"
        "--outer\n"
        "Content-Type: application/octet-stream\n"
        "Content-Transfer-Encoding: base64\n"
        f'Content-Disposition: attachment; filename="{filename}"\n'
        "\n"
        f"{b64_lines(PDF_BYTES)}\n"
        "--outer--\n"
    )


def ses_record(message_id="msg-1", source=SENDER, from_header=None, subject=SUBJECT, headers=None,
               spam="PASS", virus="PASS", dmarc="PASS"):
    return {
        "ses": {
            "mail": {
                "timestamp": "2026-10-01T12:00:00.000Z",
                "source": source,
                "messageId": message_id,
                "headers": headers if headers is not None else [{"name": "From", "value": f"{SENDER_NAME} <{SENDER}>"}],
                "commonHeaders": {
                    "from": [from_header or f"{SENDER_NAME} <{SENDER}>"],
                    "to": [TO],
                    "subject": subject,
                    "date": "Thu, 1 Oct 2026 12:00:00 +0000",
                },
            },
            "receipt": {
                "spamVerdict": {"status": spam},
                "virusVerdict": {"status": virus},
                "spfVerdict": {"status": "PASS"},
                "dkimVerdict": {"status": "PASS"},
                "dmarcVerdict": {"status": dmarc},
            },
        }
    }


def body_of(data):
    return data.split(b"\r\n\r\n", 1)[1]


class MailTestCase(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.dict(os.environ, ENV)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.s3 = FakeS3()
        self.ses = FakeSes()
        handler._clients.clear()
        handler._clients.update({"s3": self.s3, "sesv2": self.ses})
        self.addCleanup(handler._clients.clear)
        self.output = io.StringIO()

    def run_handler(self, *records):
        with contextlib.redirect_stdout(self.output):
            handler.lambda_handler({"Records": list(records)}, None)

    def log_lines(self):
        return [json.loads(line) for line in self.output.getvalue().splitlines()]

    def tags(self, message_id="msg-1"):
        return self.s3.objects[PREFIX + message_id]["tags"]


class ForwardTests(MailTestCase):
    def test_plain_message_is_forwarded_with_rewritten_headers(self):
        raw = plain_message()
        self.s3.add(PREFIX + "msg-1", raw)
        self.run_handler(ses_record())

        self.assertEqual(len(self.ses.sent), 1)
        sent = self.ses.sent[0]
        self.assertEqual(sent["FromEmailAddress"], FEEDBACK)
        self.assertEqual(sent["Destination"], {"ToAddresses": [FORWARD_TO]})
        self.assertEqual(sent["ConfigurationSetName"], "test-set")

        out = self.ses.messages()[0]
        sender = out["From"].addresses[0]
        self.assertEqual(sender.display_name, f"{SENDER_NAME} via catherder feedback")
        self.assertEqual(sender.addr_spec, FEEDBACK)
        self.assertEqual([a.addr_spec for a in out["Reply-To"].addresses], [SENDER])
        self.assertEqual([a.addr_spec for a in out["To"].addresses], [FORWARD_TO])
        self.assertIsNone(out["Cc"])
        self.assertEqual(str(out["X-Original-To"]), TO)
        self.assertEqual(str(out["X-Original-Cc"]), CC)
        self.assertEqual(str(out["X-Original-Reply-To"]), REPLY)
        self.assertEqual(str(out["X-Original-Message-ID"]), "<original-1@example.org>")
        self.assertEqual(str(out["X-Catherder-Forwarded"]), "msg-1")
        self.assertEqual(str(out["Subject"]), SUBJECT)
        for removed in ("Message-ID", "Return-Path", "Sender", "Bcc", "DKIM-Signature", "X-SES-Spam-Verdict", "X-SES-Receipt"):
            self.assertIsNone(out[removed], removed)

        self.assertEqual(body_of(sent["Content"]["Raw"]["Data"]), body_of(raw))
        self.assertEqual(self.tags(), {"forwarded": "ses-out-1"})
        self.assertEqual(self.log_lines()[0]["action"], "forwarded")

    def test_pdf_and_inline_image_are_kept_byte_for_byte(self):
        raw = attachment_message()
        self.s3.add(PREFIX + "msg-1", raw)
        self.run_handler(ses_record())

        data = self.ses.sent[0]["Content"]["Raw"]["Data"]
        self.assertEqual(body_of(data), body_of(raw))
        out = self.ses.messages()[0]
        parts = {part.get_filename(): part.get_payload(decode=True) for part in out.walk() if part.get_filename()}
        self.assertEqual(parts, {"logo.png": PNG_BYTES, "report.pdf": PDF_BYTES})
        self.assertEqual(out.get_content_type(), "multipart/mixed")

    def test_non_ascii_subject_and_name_survive(self):
        subject = "Zgłoszenie: café ✓"
        encoded_subject = "=?utf-8?b?" + base64.b64encode(subject.encode()).decode() + "?="
        encoded_name = "=?utf-8?q?Zo=C3=AB_Sample?="
        raw = plain_message(subject=encoded_subject, from_header=f"{encoded_name} <{SENDER}>")
        self.s3.add(PREFIX + "msg-1", raw)
        self.run_handler(ses_record(subject=subject))

        out = self.ses.messages()[0]
        self.assertEqual(str(out["Subject"]), subject)
        self.assertEqual(out["From"].addresses[0].display_name, "Zoë Sample via catherder feedback")
        self.assertTrue(self.ses.sent[0]["Content"]["Raw"]["Data"].isascii())

    def test_auto_submitted_no_is_forwarded(self):
        self.s3.add(PREFIX + "msg-1", plain_message())
        headers = [{"name": "Auto-Submitted", "value": "no"}]
        self.run_handler(ses_record(headers=headers))
        self.assertEqual(self.tags(), {"forwarded": "ses-out-1"})


class DropTests(MailTestCase):
    def assert_dropped(self, record, reason):
        self.s3.add(PREFIX + "msg-1", plain_message())
        self.run_handler(record)
        self.assertEqual(self.ses.sent, [])
        self.assertEqual(self.s3.get_calls, [])
        self.assertEqual(self.tags(), {"dropped": reason})
        self.assertEqual(self.log_lines()[0]["action"], f"dropped_{reason}")

    def test_spam_fail_is_dropped(self):
        self.assert_dropped(ses_record(spam="FAIL"), "spam")

    def test_virus_fail_is_dropped(self):
        self.assert_dropped(ses_record(virus="FAIL"), "virus")

    def test_mail_from_the_feedback_address_is_dropped(self):
        self.assert_dropped(ses_record(from_header=f"Feedback <{FEEDBACK}>"), "loop")

    def test_mail_from_the_feedback_domain_is_dropped(self):
        self.assert_dropped(ses_record(from_header="other@example.net"), "loop")

    def test_auto_submitted_mail_is_dropped(self):
        headers = [{"name": "Auto-Submitted", "value": "auto-replied"}]
        self.assert_dropped(ses_record(headers=headers), "loop")

    def test_mailer_daemon_is_dropped(self):
        self.assert_dropped(ses_record(source="MAILER-DAEMON@example.org"), "loop")

    def test_already_forwarded_mail_is_dropped(self):
        headers = [{"name": "X-Catherder-Forwarded", "value": "msg-0"}]
        self.assert_dropped(ses_record(headers=headers), "loop")

    def test_dropped_message_keeps_its_other_tags(self):
        self.s3.add(PREFIX + "msg-1", plain_message(), tags={"keep": "me"})
        self.run_handler(ses_record(spam="FAIL"))
        self.assertEqual(self.tags(), {"keep": "me", "dropped": "spam"})


class NoticeTests(MailTestCase):
    def assert_notice(self, record, reason):
        self.run_handler(record)
        notice = self.ses.messages()[-1]
        self.assertTrue(str(notice["Subject"]).startswith("[catherder mail] Not forwarded: "))
        self.assertEqual(str(notice["X-Catherder-Forwarded"]), "msg-1")
        self.assertEqual([a.addr_spec for a in notice["To"].addresses], [FORWARD_TO])
        self.assertEqual(notice.get_content_type(), "text/plain")
        self.assertEqual(self.tags(), {"notified": reason})
        log = self.log_lines()[0]
        self.assertEqual((log["action"], log["reason"]), ("notified", reason))
        return notice.get_content().replace("\r\n", "\n")

    def test_dmarc_fail_is_held(self):
        self.s3.add(PREFIX + "msg-1", plain_message())
        body = self.assert_notice(ses_record(dmarc="FAIL"), "held_dmarc")
        self.assertIn("DMARC", body)
        self.assertIn("Don't open its attachments.", body)
        self.assertEqual(self.s3.get_calls, [])
        self.assertEqual(len(self.ses.sent), 1)

    def test_processing_failed_is_held(self):
        for verdict in ("spam", "virus"):
            with self.subTest(verdict=verdict):
                self.setUp()
                self.s3.add(PREFIX + "msg-1", plain_message())
                body = self.assert_notice(ses_record(**{verdict: "PROCESSING_FAILED"}), "held_unscanned")
                self.assertIn("could not finish scanning", body)
                self.assertIn("Don't open its attachments.", body)

    def test_exe_attachment_gives_a_notice_naming_it(self):
        self.s3.add(PREFIX + "msg-1", attachment_message(filename="setup.exe"))
        body = self.assert_notice(ses_record(), "blocked_attachment")
        self.assertIn("attachment type SES will not send: setup.exe.", body)
        self.assertEqual(len(self.ses.sent), 1)

    def test_badly_formed_message_gives_a_notice(self):
        raw = crlf(
            f"From: {SENDER}\n"
            f"Subject: {SUBJECT}\n"
            'Content-Type: multipart/mixed; boundary="missing"\n'
            "\n"
            "no boundaries here\n"
        )
        self.s3.add(PREFIX + "msg-1", raw)
        body = self.assert_notice(ses_record(), "malformed")
        self.assertIn("badly formed", body)

    def test_malformed_log_line_holds_only_defect_names(self):
        cases = [
            (
                crlf(
                    f"From: {SENDER_NAME} <{SENDER}>\n"
                    f"Subject: {SUBJECT}\n"
                    'Content-Type: multipart/mixed; boundary="missing"\n'
                    "\n"
                    "no boundaries here\n"
                ),
                ["MultipartInvariantViolationDefect", "StartBoundaryNotFoundDefect"],
            ),
            (
                crlf(f"From: {SENDER}\nFrom: {REPLY}\nSubject: {SUBJECT}\n\nbody\n"),
                ["missing_or_multiple_from"],
            ),
        ]
        for raw, expected in cases:
            with self.subTest(expected=expected):
                self.setUp()
                self.s3.add(PREFIX + "msg-1", raw)
                self.run_handler(ses_record())
                output = self.output.getvalue()
                for secret in (FEEDBACK, FORWARD_TO, SENDER, SENDER_NAME, REPLY, SUBJECT, "@"):
                    self.assertNotIn(secret, output)
                log = self.log_lines()[0]
                self.assertEqual(log["defects"], expected)
                self.assertEqual(log["reason"], "malformed")

    def test_oversized_message_gives_a_notice(self):
        self.s3.add(PREFIX + "msg-1", plain_message())
        with mock.patch.object(handler, "MAX_FORWARD_BYTES", 100):
            body = self.assert_notice(ses_record(), "too_large")
        self.assertIn("too large", body)
        self.assertEqual(len(self.ses.sent), 1)

    def test_message_rejected_gives_a_notice(self):
        self.s3.add(PREFIX + "msg-1", plain_message())
        self.ses.fail_with = ["MessageRejected"]
        body = self.assert_notice(ses_record(), "refused")
        self.assertIn("SES refused to send it on (MessageRejected).", body)
        self.assertEqual(len(self.ses.sent), 2)

    def test_notice_body_has_the_console_link_and_copy_command(self):
        self.s3.add(PREFIX + "msg-1", plain_message())
        body = self.assert_notice(ses_record(dmarc="FAIL"), "held_dmarc")
        self.assertIn(f"Stored until 2026-10-31 at s3://{BUCKET}/{PREFIX}msg-1", body)
        self.assertIn(
            f"open https://us-east-2.console.aws.amazon.com/s3/object/{BUCKET}?region=us-east-2&prefix={PREFIX}msg-1 "
            "and choose Download, then open the file in Thunderbird. It is the message exactly as it arrived.",
            body,
        )
        self.assertIn("Or from a terminal with your AWS profile set:\n", body)
        self.assertIn(f"aws s3 cp s3://{BUCKET}/{PREFIX}msg-1 msg-1.eml --region us-east-2 --no-cli-pager", body)
        self.assertIn(f"From: {SENDER_NAME} <{SENDER}>", body)
        self.assertIn(f"Subject: {SUBJECT}", body)
        self.assertIn("SES message id: msg-1", body)

    def test_notice_subject_is_cut_to_100_characters(self):
        self.s3.add(PREFIX + "msg-1", plain_message())
        self.run_handler(ses_record(subject="x" * 150, dmarc="FAIL"))
        notice = self.ses.messages()[0]
        self.assertEqual(str(notice["Subject"]), "[catherder mail] Not forwarded: " + "x" * 100)


class IdempotencyAndErrorTests(MailTestCase):
    def test_already_tagged_object_is_skipped(self):
        for tag in ("forwarded", "notified", "dropped"):
            with self.subTest(tag=tag):
                self.setUp()
                self.s3.add(PREFIX + "msg-1", plain_message(), tags={tag: "x"})
                self.run_handler(ses_record())
                self.assertEqual(self.ses.sent, [])
                self.assertEqual(self.s3.get_calls, [])
                self.assertEqual(self.s3.tag_writes, [])
                self.assertEqual(self.log_lines()[0]["action"], "skipped_done")

    def test_send_error_is_raised_without_the_original_message(self):
        self.s3.add(PREFIX + "msg-1", plain_message())
        self.ses.fail_with = ["Throttling"]
        with self.assertRaises(handler.MailError) as raised:
            self.run_handler(ses_record())
        self.assertNotIn(SENDER, str(raised.exception))
        self.assertIn("Throttling", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)
        self.assertTrue(raised.exception.__suppress_context__)
        self.assertEqual(self.s3.tag_writes, [])

    def test_logs_hold_no_addresses_or_subjects(self):
        cases = [
            (plain_message(), {}),
            (plain_message(), {"spam": "FAIL"}),
            (plain_message(), {"dmarc": "FAIL"}),
            (attachment_message(filename="setup.exe"), {}),
            (plain_message(), {"headers": [{"name": "Auto-Submitted", "value": "auto-replied"}]}),
        ]
        for number, (raw, options) in enumerate(cases):
            self.s3.add(f"{PREFIX}msg-{number}", raw)
            self.run_handler(ses_record(message_id=f"msg-{number}", **options))

        output = self.output.getvalue()
        for secret in (FEEDBACK, FORWARD_TO, SENDER, SENDER_NAME, REPLY, TO, CC, SUBJECT, "setup.exe", "@"):
            self.assertNotIn(secret, output)
        lines = self.log_lines()
        self.assertEqual(len(lines), len(cases))
        allowed = {"messageId", "spam", "virus", "spf", "dkim", "dmarc", "action", "reason", "size"}
        for line in lines:
            self.assertLessEqual(set(line), allowed)


if __name__ == "__main__":
    unittest.main()
