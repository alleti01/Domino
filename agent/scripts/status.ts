// Quick check: is Nightshift up, does our token work, and which routing modes does it expose?
import { NightshiftClient } from "../src/llm/nightshift.js";
console.log(JSON.stringify(await new NightshiftClient().status(), null, 2));
