"""Settings, read once at start-up."""

SETTINGS = {
    "currency": "INR",
    "page_size": 20,
    "gst_default": 18,
    "max_upload_kb": 512,
}


def setting(name: str):
    return SETTINGS[name]
