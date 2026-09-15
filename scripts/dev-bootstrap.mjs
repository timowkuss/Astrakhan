import fs from "node:fs";
import { randomBytes } from "node:crypto";
if (!fs.existsSync(".env")) {
  fs.writeFileSync(
    ".env",
    `APP_MODE=development\nAUTH_SECRET=${randomBytes(48).toString("base64")}\nSTORE_PHONE=+77023135383\n`,
  );
  console.log("Created .env with a random development secret.");
} else console.log(".env already exists; preserved.");
