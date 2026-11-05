import { initDb } from './db.js';
import { createApp } from './app.js';
const db = initDb(process.env.DB_FILE ?? 'data.sqlite');
const port = Number(process.env.PORT ?? 4000);
createApp(db).listen(port, () => console.log(`Order API running at http://localhost:${port}`));
