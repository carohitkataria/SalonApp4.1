"""
seed_template_library.py — Idempotently seed the platform-level
`platform_template_library` collection with a standard set of WhatsApp
templates (invoice, booking confirmation, reminder, review request, offer).

These are the templates auto-provisioned onto every salon's WABA when they
connect via Embedded Signup (Phase 3.3), and are browsable/usable from the
Marketing → Templates "Template library" tab (Phase 3.2).

Run: python seed_template_library.py
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _body(text: str, example=None):
    comp = {"type": "BODY", "text": text}
    if example:
        comp["example"] = {"body_text": [example]}
    return comp


def _doc_header():
    """Document (PDF) header — Meta requires a sample handle/URL for review."""
    return {
        "type": "HEADER",
        "format": "DOCUMENT",
        "example": {"header_handle": ["https://salonhub.in/sample-invoice.pdf"]},
    }


def _review_button():
    """Dynamic-URL call-to-action button (review page). Button URL variables are
    numbered per-button starting at {{1}}."""
    return {
        "type": "BUTTONS",
        "buttons": [
            {"type": "URL", "text": "View & review",
             "url": "https://salonhub.in/{{1}}", "example": ["https://salonhub.in/r/abc123"]},
        ],
    }


def _group_for(t: dict) -> str:
    n = t.get("name", "")
    if "invoice" in n:
        return "invoice"
    if "booking" in n:
        return "booking"
    if "reminder" in n:
        return "reminder"
    if "queue" in n or "follow" in n:
        return "queue_followup"
    return "marketing"


LIBRARY = [
    {
        "name": "booking_confirmation",
        "friendly_name": "Booking confirmation",
        "category": "utility",
        "description": "Sent when a booking is confirmed.",
        "meta_payload": {
            "name": "booking_confirmation",
            "category": "UTILITY",
            "language": "en_US",
            "components": [
                _body("Hi {{1}}, your booking at {{2}} is confirmed for {{3}}. See you soon!",
                      ["Aarav", "Glam Studio", "12 Sep, 4:00 PM"]),
            ],
        },
    },
    {
        "name": "appointment_reminder",
        "friendly_name": "Appointment reminder",
        "category": "utility",
        "description": "Reminder before an upcoming appointment.",
        "meta_payload": {
            "name": "appointment_reminder",
            "category": "UTILITY",
            "language": "en_US",
            "components": [
                _body("Reminder: {{1}}, you have an appointment at {{2}} on {{3}}.",
                      ["Aarav", "Glam Studio", "tomorrow 4:00 PM"]),
            ],
        },
    },
    {
        "name": "invoice_ready",
        "friendly_name": "Invoice",
        "category": "utility",
        "description": "Sent with the invoice link after a visit.",
        "meta_payload": {
            "name": "invoice_ready",
            "category": "UTILITY",
            "language": "en_US",
            "components": [
                _body("Thanks for visiting {{1}}, {{2}}! Your invoice #{{3}} for {{4}} is ready.",
                      ["Glam Studio", "Aarav", "1042", "₹899"]),
            ],
        },
    },
    {
        "name": "review_request",
        "friendly_name": "Review request",
        "category": "marketing",
        "description": "Ask the customer to leave a review.",
        "meta_payload": {
            "name": "review_request",
            "category": "MARKETING",
            "language": "en_US",
            "components": [
                _body("Hi {{1}}, we'd love your feedback on your recent visit to {{2}}. Tap to rate us!",
                      ["Aarav", "Glam Studio"]),
            ],
        },
    },
    {
        "name": "special_offer",
        "friendly_name": "Offer",
        "category": "marketing",
        "description": "Promote an offer or discount.",
        "meta_payload": {
            "name": "special_offer",
            "category": "MARKETING",
            "language": "en_US",
            "components": [
                _body("{{1}}, enjoy {{2}} off your next visit to {{3}}. Book now!",
                      ["Aarav", "20%", "Glam Studio"]),
            ],
        },
    },
    # ---- Invoice ×3 variants (document header + review button) ----
    {
        "name": "invoice_1",
        "friendly_name": "Invoice — Classic",
        "category": "utility",
        "description": "Invoice PDF with a thank-you note and review button.",
        "meta_payload": {
            "name": "invoice_1", "category": "UTILITY", "language": "en_US",
            "components": [
                _doc_header(),
                _body("Hi {{1}}, thanks for visiting {{2}}! Your invoice #{{3}} for {{4}} is attached.",
                      ["Aarav", "Glam Studio", "1042", "₹899"]),
                {"type": "FOOTER", "text": "Powered by SalonHub"},
                _review_button(),
            ],
        },
    },
    {
        "name": "invoice_2",
        "friendly_name": "Invoice — Concise",
        "category": "utility",
        "description": "Short invoice message with PDF header and review button.",
        "meta_payload": {
            "name": "invoice_2", "category": "UTILITY", "language": "en_US",
            "components": [
                _doc_header(),
                _body("{{1}}, your {{2}} invoice #{{3}} ({{4}}) is ready. Tap below to view & review.",
                      ["Aarav", "Glam Studio", "1042", "₹899"]),
                _review_button(),
            ],
        },
    },
    {
        "name": "invoice_3",
        "friendly_name": "Invoice — Warm",
        "category": "utility",
        "description": "Friendly invoice message with PDF header and review button.",
        "meta_payload": {
            "name": "invoice_3", "category": "UTILITY", "language": "en_US",
            "components": [
                _doc_header(),
                _body("Thank you, {{1}}! We loved having you at {{2}}. Invoice #{{3}} for {{4}} is attached — see you again soon!",
                      ["Aarav", "Glam Studio", "1042", "₹899"]),
                {"type": "FOOTER", "text": "Powered by SalonHub"},
                _review_button(),
            ],
        },
    },
    # ---- Queue follow-up ----
    {
        "name": "queue_followup",
        "friendly_name": "Queue follow-up",
        "category": "utility",
        "description": "Sent after a walk-in leaves the queue without being served.",
        "meta_payload": {
            "name": "queue_followup", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("Hi {{1}}, sorry we couldn't serve you at {{2}} today. Reply to grab a priority slot next time!",
                      ["Aarav", "Glam Studio"]),
            ],
        },
    },
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    now = datetime.now(timezone.utc).isoformat()
    upserts = 0
    for t in LIBRARY:
        res = await db.platform_template_library.update_one(
            {"name": t["name"]},
            {"$set": {**t, "auto_provision": True,
                      "enabled_for_salons": t.get("enabled_for_salons", True),
                      "group": t.get("group") or _group_for(t),
                      "updated_at": now},
             "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
            upsert=True,
        )
        if res.upserted_id or res.modified_count:
            upserts += 1
    total = await db.platform_template_library.count_documents({})
    print(f"[seed_template_library] upserted/updated {upserts}; library now has {total} templates")


if __name__ == "__main__":
    asyncio.run(main())
