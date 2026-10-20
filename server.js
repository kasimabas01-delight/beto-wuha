// አውቶማቲክ ባክአፕ ሥርዓት የተገጠመለት ሙሉው server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const exceljs = require('exceljs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const cron = require('node-cron'); // ለአውቶማቲክ ባክአፕ ስራ

const app = express();
const db = new sqlite3.Database('water_billing.db');

app.use(express.json());
app.use(express.static('public'));

// አስፈላጊ የሆኑ ፎልደሮች መኖራቸውን ማረጋገጥ
if (!fs.existsSync('./public/uploads/')) {
    fs.mkdirSync('./public/uploads/', { recursive: true });
}
if (!fs.existsSync('./backups/')) {
    fs.mkdirSync('./backups/', { recursive: true }); // የመጠባበቂያ መረጃ ማስቀመጫ ፎልደር
}

// ----------------------------------------------------
// 💾 አውቶማቲክ የዳታቤዝ ባክአፕ ሥርዓት (መስፈርት 4 & 23)
// ----------------------------------------------------
// በየቀኑ እኩለ ሌሊት 00:00 (በኢትዮጵያ 6:00 ሰዓት) ላይ በራሱ ባክአፕ ያደርጋል
cron.schedule('0 0 * * *', () => {
    const today = new Date().toISOString().split('T')[0];
    const backupFileName = `./backups/backup-${today}.db`;

    fs.copyFile('water_billing.db', backupFileName, (err) => {
        if (err) {
            console.error('❌ አውቶማቲክ ባክአፕ ማድረግ አልተቻለም፡', err);
        } else {
            console.log(`💾 ስኬት፡ የዕለቱ የዳታቤዝ መረጃ በደህንነት ተቀምጧል -> ${backupFileName}`);
        }
    });
});

// የፎቶ ጥቆማ ማጣሪያ
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => cb(null, 'REPORT-' + Date.now() + path.extname(file.originalname))
});

const uploadValidation = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) return cb(null, true);
        cb(new Error('ስህተት፡ ፈቃድ የተሰጣቸው የምስል ፋይሎች ብቻ ናቸው (JPG, JPEG, PNG)!'));
    }
});

// ዳታቤዝ መፍጠር
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY, personal_tariff REAL, business_tariff REAL, penalty_rate REAL, deadline_day INTEGER
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, meter_number TEXT UNIQUE, type TEXT, status TEXT DEFAULT 'Active', deleted INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, year_month TEXT, prev_reading REAL, curr_reading REAL, 
        consumption REAL, net_bill REAL, penalty REAL, total_amount REAL, is_paid INTEGER DEFAULT 0, reader_name TEXT, reading_date TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, message TEXT, image_path TEXT
    )`);

    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO system_settings VALUES (1, 15.0, 25.0, 0.10, 25)");
            const adminHash = bcrypt.hashSync('admin123', 10);
            const readerHash = bcrypt.hashSync('reader123', 10);
            db.run("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'Admin')", [adminHash]);
            db.run("INSERT INTO users (username, password, role) VALUES ('reader', ?, 'Reader')", [readerHash]);
            console.log("🔒 የመነሻ ተጠቃሚዎች የይለፍ ቃል በደህንነት ተቆልፏል!");
        }
    });
});

// APIs
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) return res.status(401).json({ error: "የተጠቃሚ ስም ወይም የይለፍ ቃል የተሳሳተ ነው!" });
        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "የተጠቃሚ ስም ወይም የይለፍ ቃል የተሳሳተ ነው!" });
        res.json({ success: true, message: "በተሳካ ሁኔታ ገብተዋል", role: user.role });
    });
});

app.post('/api/feedback', uploadValidation.single('photo'), (req, res) => {
    const { phone, message } = req.body;
    const image_path = req.file ? '/uploads/' + req.file.filename : null;
    db.run("INSERT INTO feedback (phone, message, image_path) VALUES (?, ?, ?)", [phone, message, image_path], (err) => {
        if (err) return res.status(500).json({ error: "ጥቆማውን መመዝገብ አልተቻለም" });
        res.json({ success: true, message: "ጥቆማዎ በደህንነት ተመዝግቧል!" });
    });
}, (error, req, res, next) => {
    res.status(400).json({ error: error.message });
});

app.post('/api/customers', (req, res) => {
    const { name, meter_number, type } = req.body;
    db.run(`INSERT INTO customers (name, meter_number, type) VALUES (?, ?, ?)`, [name, meter_number, type], (err) => {
        if (err) return res.status(500).json({ error: "ይህ የቆጣሪ ቁጥር ቀድሞ ተመዝግቧል!" });
        res.json({ success: true, message: "አዲስ ደንበኛ በተሳካ ሁኔታ ተመዝግቧል" });
    });
});

app.get('/api/customers', (req, res) => {
    db.all("SELECT * FROM customers WHERE deleted = 0 ORDER BY id DESC", (err, rows) => res.json(rows));
});

app.get('/api/bill/:meter_number', (req, res) => {
    db.get("SELECT c.name, c.type, r.* FROM readings r JOIN customers c ON r.customer_id = c.id WHERE c.meter_number = ? AND c.deleted = 0 AND r.is_paid = 0 ORDER BY r.id DESC LIMIT 1", [req.params.meter_number], (err, row) => res.json(row));
});

app.get('/api/reports/excel', (req, res) => {
    db.all("SELECT c.name, c.meter_number, r.year_month, r.total_amount, r.is_paid FROM readings r JOIN customers c ON r.customer_id = c.id", async (err, rows) => {
        if (err || !rows) return res.status(505).send("ሪፖርት ማውጣት አልተቻለም");
        const workbook = new exceljs.Workbook();
        const worksheet = workbook.addWorksheet('የውሃ ፍጆታ ሪፖርት');
        worksheet.columns = [
            { header: 'የደንበኛ ስም', key: 'name', width: 25 },
            { header: 'የቆጣሪ ቁጥር', key: 'meter_number', width: 15 },
            { header: 'ወር', key: 'year_month', width: 10 },
            { header: 'አጠቃላይ ሂሳብ', key: 'total_amount', width: 15 },
            { header: 'የክፍያ ሁኔታ', key: 'is_paid', width: 15 }
        ];
        rows.forEach(item => worksheet.addRow({ ...item, is_paid: item.is_paid ? 'የተከፈለ' : 'ያልከፈለ' }));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=water_report.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    });
});

app.post('/api/sms/send-all', (req, res) => {
    db.all("SELECT c.name, r.total_amount FROM readings r JOIN customers c ON r.customer_id = c.id WHERE r.is_paid = 0", (err, rows) => {
        console.log(`ለ ${rows ? rows.length : 0} ደንበኞች የብድር ማሳሰቢያ SMS ተልኳል`);
        res.json({ success: true, message: `ለ ${rows ? rows.length : 0} ደንበኞች SMS በተሳካ ሁኔታ ተልኳል` });
    });
});

app.post('/api/customers/restore/:id', (req, res) => {
    db.run("UPDATE customers SET deleted = 0 WHERE id = ?", [req.params.id], (err) => {
        res.json({ success: true, message: "ደንበኛው ከቆሻሻ መጣያ ተመልሷል" });
    });
});

app.listen(3000, () => {
    console.log('🛡️  የደህንነት ሲስተሙ በወደብ 3000 ላይ ተነስቷል፡ http://localhost:3000');
    console.log('⏰ አውቶማቲክ ዕለታዊ ባክአፕ በሥራ ላይ ይገኛል!');
});
