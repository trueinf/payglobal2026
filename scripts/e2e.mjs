// End-to-end: employee chats in Strada Pay → assistant verifies, finds the R03 return, opens a case, transfers →
// workspace gets the incoming notification → representative accepts, replies, ends → wrap-up → disposition → close.
import { chromium } from "playwright";
const shots = process.env.SHOTS ?? "/tmp/strada-e2e";
import fs from "fs"; fs.mkdirSync(shots, { recursive: true });
const b = await chromium.launch();
const errors = [];
const mk = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); p.on("pageerror", e => errors.push(`${w}: ${e.message}`)); p.on("console", m => m.type() === "error" && errors.push(`${w} console: ${m.text()}`)); return p; };
const emp = await mk(900, 820); const ws = await mk(1600, 900);
const R = "http://localhost:8080";
await fetch(R + "/demo/reset", { method: "POST" });                       // fresh demo day
await fetch(R + "/conversations/cv1/close", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dispositionCode: "Bank return – live check issued" }) }); // park the seeded voice call so only ours rings

await emp.goto("http://localhost:5174"); await emp.waitForSelector("text=Tom Reilly"); await emp.click("text=Tom Reilly");
await emp.click("text=Chat with the assistant"); await emp.waitForSelector("text=Strada Pay assistant"); await emp.waitForTimeout(800);
await emp.screenshot({ path: `${shots}/01-pay-home-chat.png` });

const say = async (t, waitFor) => { await emp.fill("input[placeholder]", t); await emp.press("input[placeholder]", "Enter"); await emp.waitForSelector(`text=${waitFor}`, { timeout: 90000 }); await emp.waitForTimeout(400); };
await say("My pay didn't come in this morning. Everyone else on my unit got paid.", "verify");
await say("9104", "R03");
await emp.screenshot({ path: `${shots}/02-pay-chat-r03.png` });

await ws.goto("http://localhost:5173"); await ws.waitForTimeout(2500);
await say("I'd rather talk to a person about this.", "Transferred to queue");
await emp.screenshot({ path: `${shots}/03-pay-transferred.png` });

await ws.waitForSelector(".incoming", { timeout: 15000 }); await ws.waitForTimeout(600);
await ws.screenshot({ path: `${shots}/04-ws-incoming.png` });
// accept the one for Tom (the seeded cv1 may be first) — click Accept repeatedly until our chat session is open
await ws.click(".incoming >> text=Accept"); await ws.waitForSelector(".cpanel", { timeout: 15000 }); await ws.waitForTimeout(1200);
await ws.screenshot({ path: `${shots}/05-ws-session.png` });

// representative replies (Copilot suggestion first)
await ws.click("text=Suggest a response"); await ws.waitForFunction(() => (document.querySelector(".cinput textarea")?.value ?? "").length > 20, null, { timeout: 60000 });
await ws.screenshot({ path: `${shots}/06-ws-suggested.png` });
await ws.click(".cinput button:has-text('Send')"); await emp.waitForSelector(".bubble.rep", { timeout: 15000 });
await say("Thanks. Can I just get a check today?", "Can I just get a check");
await ws.waitForTimeout(500);
await ws.fill(".cinput textarea", "Yes. A live check for $1,744.90 goes out by courier before 2 PM Eastern to the Meridian site; you'll get a text when it's dispatched.");
await ws.click(".cinput button:has-text('Send')"); await emp.waitForSelector("text=courier", { timeout: 15000 });
await emp.screenshot({ path: `${shots}/07-pay-rep-reply.png` });
await ws.waitForTimeout(3000); // summary debounce
await ws.screenshot({ path: `${shots}/08-ws-active-form.png`, fullPage: false });

// end → wrap-up
await ws.click('[aria-label="End"], button.cctl.danger'); await ws.waitForSelector("text=Wrap-up", { timeout: 15000 }); await ws.waitForTimeout(6000); // CM agent wrap-up
await ws.screenshot({ path: `${shots}/09-ws-wrapup.png` });
// close without disposition → blocked
const activeTab = await ws.$(".sesstab.active .x"); await activeTab.click(); await ws.waitForSelector(".toast:has-text('Select a disposition code')", { timeout: 5000 });
// pick disposition then close
await ws.selectOption("select:has-option('Bank return – live check issued')", "Bank return – live check issued").catch(async () => { const sels = await ws.$$("select"); for (const s of sels) { const opts = await s.$$eval("option", o => o.map(x => x.value)); if (opts.includes("Bank return – live check issued")) { await s.selectOption("Bank return – live check issued"); break; } } });
await ws.waitForTimeout(800);
await (await ws.$(".sesstab.active .x")).click(); await ws.waitForTimeout(1500);
await ws.screenshot({ path: `${shots}/10-ws-closed.png` });
await emp.waitForTimeout(500); await emp.screenshot({ path: `${shots}/11-pay-closed.png` });
console.log("errors:", errors.length ? errors : "none");
await b.close();
