"""Accepts a student's code submission and queues it for the judge."""

RUNNERS = {
    "python": "python3.12",
    "cpp": "g++-13",
    "java": "openjdk-21",
}


def prepare_submission(data):
    code = data.get("code", "")
    if not code.strip():
        return {"ok": False, "error": "Write some code before submitting"}
    language = data["language"]
    runner = RUNNERS[language]
    return {"ok": True, "runner": runner, "queued": True, "bytes": len(code)}
