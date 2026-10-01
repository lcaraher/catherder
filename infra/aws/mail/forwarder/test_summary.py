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
import summary
from test_handler import BUCKET, ENV, FORWARD_TO, PREFIX, SENDER, FakeS3, FakeSes, crlf


def stored(subject, size=0):
    return crlf(
        f"From: Sample Sender <{SENDER}>\n"
        f"Subject: {subject}\n"
        "Date: Thu, 1 Oct 2026 12:00:00 +0000\n"
        "\n"
    ) + b"x" * size


class SummaryTests(unittest.TestCase):
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
        self.today = datetime.datetime.now(datetime.UTC).date().isoformat()

    def run_summary(self):
        with contextlib.redirect_stdout(self.output):
            summary.summary_handler({}, None)

    def sent_message(self):
        self.assertEqual(len(self.ses.sent), 1)
        sent = self.ses.sent[0]
        self.assertEqual(sent["Destination"], {"ToAddresses": [FORWARD_TO]})
        return BytesParser(policy=policy.default).parsebytes(sent["Content"]["Raw"]["Data"])

    def test_no_dropped_objects_sends_nothing(self):
        self.s3.add(PREFIX + "a", stored("Forwarded one"), tags={"forwarded": "ses-1"})
        self.s3.add(PREFIX + "b", stored("Notified one"), tags={"notified": "held_dmarc"})
        self.run_summary()
        self.assertEqual(self.ses.sent, [])
        self.assertEqual(self.s3.tag_writes, [])
        self.assertEqual(json.loads(self.output.getvalue()), {"count": 0})

    def test_two_dropped_objects_send_one_email_and_are_tagged(self):
        self.s3.add(PREFIX + "a", stored("Cheap watches"), tags={"dropped": "spam", "keep": "me"})
        self.s3.add(PREFIX + "b", stored("Invoice attached"), tags={"dropped": "virus"})
        self.s3.add(PREFIX + "c", stored("Real feedback"), tags={"forwarded": "ses-1"})
        self.run_summary()

        message = self.sent_message()
        self.assertEqual(str(message["Subject"]), "[catherder mail] Daily summary: 2 not forwarded")
        body = message.get_content()
        self.assertIn("Subject: Cheap watches", body)
        self.assertIn("Subject: Invoice attached", body)
        self.assertNotIn("Real feedback", body)
        self.assertIn("SES marked it as spam.", body)
        self.assertIn("SES found a virus in it.", body)
        self.assertEqual(body.count("Don't open its attachments."), 1)
        self.assertIn(f"Stored until 2026-10-31 at s3://{BUCKET}/{PREFIX}a", body)
        self.assertIn(f"https://us-east-2.console.aws.amazon.com/s3/object/{BUCKET}?region=us-east-2&prefix={PREFIX}b", body)
        self.assertIn(f"aws s3 cp s3://{BUCKET}/{PREFIX}b b.eml --region us-east-2 --no-cli-pager", body)

        self.assertEqual(self.s3.objects[PREFIX + "a"]["tags"], {"dropped": "spam", "keep": "me", "summarized": self.today})
        self.assertEqual(self.s3.objects[PREFIX + "b"]["tags"], {"dropped": "virus", "summarized": self.today})
        self.assertEqual(self.s3.objects[PREFIX + "c"]["tags"], {"forwarded": "ses-1"})
        self.assertEqual(json.loads(self.output.getvalue()), {"count": 2})

    def test_already_summarized_object_is_not_listed_again(self):
        self.s3.add(PREFIX + "a", stored("Old spam"), tags={"dropped": "spam", "summarized": "2026-09-30"})
        self.s3.add(PREFIX + "b", stored("New spam"), tags={"dropped": "spam"})
        self.run_summary()

        message = self.sent_message()
        self.assertEqual(str(message["Subject"]), "[catherder mail] Daily summary: 1 not forwarded")
        body = message.get_content()
        self.assertNotIn("Old spam", body)
        self.assertIn("New spam", body)
        self.assertEqual(self.s3.objects[PREFIX + "a"]["tags"]["summarized"], "2026-09-30")

    def test_only_a_ranged_read_is_made(self):
        self.s3.add(PREFIX + "a", stored("Big spam", size=200_000), tags={"dropped": "loop"})
        self.run_summary()
        self.assertEqual(self.s3.get_calls, [{"Key": PREFIX + "a", "Range": "bytes=0-65535"}])
        self.assertIn("A loop guard stopped it", self.sent_message().get_content())

    def test_log_holds_no_addresses_or_subjects(self):
        self.s3.add(PREFIX + "a", stored("Cheap watches"), tags={"dropped": "spam"})
        self.run_summary()
        output = self.output.getvalue()
        self.assertNotIn(SENDER, output)
        self.assertNotIn("Cheap watches", output)
        self.assertEqual(json.loads(output), {"count": 1})


if __name__ == "__main__":
    unittest.main()
