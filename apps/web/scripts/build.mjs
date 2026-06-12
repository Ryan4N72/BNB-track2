import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("dist/src", { recursive: true });
await copyFile("src/styles.css", "dist/src/styles.css");
await copyFile("src/app.js", "dist/src/app.js");
await writeFile("dist/index.html", await readFile("index.html", "utf8"));
await writeFile("dist/build-info.txt", `SignalForge AI static build generated at ${new Date().toISOString()}\n`);

console.log("Static build written to dist/");
