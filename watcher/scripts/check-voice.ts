// Makes one wake-up call with the configured voice provider and saves it, to check the key works.
import { makeVoice, wakeText } from "../src/voice/voice.js";

process.loadEnvFile(new URL("../.env", import.meta.url));
const dir = process.argv[2] ?? new URL("../data/voice/", import.meta.url).pathname;
const voice = makeVoice(dir);
if (!voice) {
  console.log("No voice provider set (JR_VOICE_PROVIDER and its key).");
  process.exit(0);
}
const info = { project: "Faurus", flow: "code submission", hits: 6, exam: true };
console.log("text:", wakeText(info, process.env.JR_VOICE_LANG === "en" ? "en" : "hi"));
const started = Date.now();
const clip = await voice.wakeCall(info);
console.log(clip ? `OK in ${Date.now() - started} ms: ${clip.ogg.length} bytes of OGG/Opus, id ${clip.id}, saved in ${dir}` : "no clip");
