/* The real fix for the demo portal's Submit bug (sandbox/fixed.patch). A plain module, so server components can read it. */
export const SUBMIT_DIFF = `--- a/portal/submissions.py
+++ b/portal/submissions.py
@@ -11,6 +11,8 @@
     code = data.get("code", "")
     if not code.strip():
         return {"ok": False, "error": "Write some code before submitting"}
-    language = data["language"]
-    runner = RUNNERS[language]
+    language = data.get("language")
+    runner = RUNNERS.get(language)
+    if runner is None:
+        return {"ok": False, "error": "Choose a supported language (python, cpp or java) before submitting"}
     return {"ok": True, "runner": runner, "queued": True, "bytes": len(code)}`;
