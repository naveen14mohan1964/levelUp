# Moving Level Up to a new laptop

This folder holds everything that is not code: a full database backup and the two plan documents.
This repository is public: the backup holds your own data only (third-party LinkedIn contacts are removed). Never commit `.env` files.

| File | What it is |
|---|---|
| `DSATracker-2026-11-22-public.bak` | Full SQL Server backup of the `DSATracker` database (all progress, journal, meals, weight, settings), taken 2026-11-22, compressed, checksum verified. **LinkedIn contacts removed** (other people's data): the complete backup with contacts is `C:\Users\Public\LevelUp-backup\DSATracker-2026-11-22.bak` on the old laptop, copy it by hand if you need them |
| `plans/STUDY_PLAN.md`, `plans/WORKOUT_PLAN.md` | The plan documents `npm run plan:build` reads. They belong **one folder above** `tracker/` |

## 1. Install
- SQL Server 2022 (Developer or Express) + ODBC Driver 17 for SQL Server
- Node.js 22, Git
- Optional: PM2 (`npm i -g pm2`) for the always-on app

## 2. Get the code
```
mkdir DSA && cd DSA
git clone https://github.com/naveen14mohan1964/levelUp.git tracker
copy tracker\backup\plans\*.md .
cd tracker
npm run setup
```

## 3. Restore the database
Copy the `.bak` somewhere SQL Server can read (for example `C:\Users\Public\`), then in SSMS or `sqlcmd`:
```sql
RESTORE FILELISTONLY FROM DISK = N'C:\Users\Public\DSATracker-2026-11-22-public.bak';
-- use the two logical names it prints in MOVE ... below
RESTORE DATABASE [DSATracker] FROM DISK = N'C:\Users\Public\DSATracker-2026-11-22-public.bak'
WITH MOVE N'DSATracker'     TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\DATA\DSATracker.mdf',
     MOVE N'DSATracker_log' TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\DATA\DSATracker_log.ldf',
     RECOVERY, STATS = 10;
```
Then run `npm run db:setup` once: it only adds anything newer than the backup and never removes progress.

## 4. Copy these by hand (never in git)
They hold secrets, so they are not in the repository. Copy them from the old laptop (USB or OneDrive):
- `tracker/server/.env` (Gemini key, Telegram bot token, database settings)
- `tracker/.env` (Docker settings)
- `linkedin-mcp/.env` (LinkedIn app keys and token), if you use the LinkedIn connector
- `tracker/server/uploads/` (meal and progress photos, your own alarm sounds), if you want them

If the SQL Server name changes, update it in `server/.env`.

## 5. Run
```
npm run dev          # development: UI on 5173, API on 4001
npm run app:start    # always-on app on http://localhost:4000 (PM2)
npm run app:autostart
```
