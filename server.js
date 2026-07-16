const express = require('express');
const bodyParser = require('body-parser');
const pool = require('./db');
const app = express();

// Add these lines at the TOP of your file
const multer = require('multer');
const path = require('path');

const session = require('express-session');
const bcrypt = require('bcrypt');

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});




// Session middleware
app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: false
}));


app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Home page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Register Student
app.post('/register', async (req, res) => {
    const { name, email, department, cgpa, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        await pool.query(
            'INSERT INTO Student (name, email, department, cgpa, password) VALUES ($1, $2, $3, $4, $5)',
            [name, email, department, cgpa, hashedPassword]
        );
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.send('Registration error');
    }
});


app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/public/register.html');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM Student WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.send('User not found');
        }
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.userId = user.student_id;
            res.redirect('/dashboard');
        } else {
            res.send('Incorrect password');
        }
    } catch (err) {
        console.error(err);
        res.send('Login error');
    }
});




app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    const student = await pool.query('SELECT * FROM Student WHERE student_id = $1', [req.session.userId]);
    res.render('student_dashboard', { students: [student.rows[0]] });
});


app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login_student.html');
});


app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/resume', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.sendFile(__dirname + '/public/resume.html');
});


app.post('/submit_resume', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    const { skills, projects, experience } = req.body;
    try {
        // Check if resume already exists for this student
        const existing = await pool.query('SELECT * FROM Resume WHERE student_id = $1', [req.session.userId]);
        if (existing.rows.length > 0) {
            // Update resume
            await pool.query(
                'UPDATE Resume SET skills = $1, projects = $2, experience = $3 WHERE student_id = $4',
                [skills, projects, experience, req.session.userId]
            );
        } else {
            // Insert new resume
            await pool.query(
                'INSERT INTO Resume (student_id, skills, projects, experience) VALUES ($1, $2, $3, $4)',
                [req.session.userId, skills, projects, experience]
            );
        }
        res.send('Resume submitted successfully! <a href="/dashboard">Go to Dashboard</a>');
    } catch (err) {
        console.error(err);
        res.send('Error submitting resume');
    }
});


app.get('/companies', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const result = await pool.query('SELECT * FROM Company');
    res.render('company_list', { companies: result.rows });
});

app.get('/apply/:id', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const companyId = req.params.id;
    try {
        // Prevent duplicate applications
        const check = await pool.query(
            'SELECT * FROM Application WHERE student_id = $1 AND company_id = $2',
            [req.session.userId, companyId]
        );
        if (check.rows.length > 0) {
            return res.send('Already applied. <a href="/companies">Back</a>');
        }

        await pool.query(
            'INSERT INTO Application (student_id, company_id, status) VALUES ($1, $2, $3)',
            [req.session.userId, companyId, 'Pending']
        );
        res.send('Application submitted! <a href="/companies">Back</a>');
    } catch (err) {
        console.error(err);
        res.send('Error applying.');
    }
});

app.get('/applications', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const result = await pool.query(`
        SELECT c.name, c.role_offered, a.status
        FROM Application a
        JOIN Company c ON a.company_id = c.company_id
        WHERE a.student_id = $1
    `, [req.session.userId]);
    res.render('application_status', { apps: result.rows });
});


app.get('/placement_status', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const result = await pool.query(`
            SELECT c.name AS company_name, p.date_of_offer
            FROM Placement p
            JOIN Company c ON p.company_id = c.company_id
            WHERE p.student_id = $1
        `, [req.session.userId]);

        if (result.rows.length === 0) {
            return res.render('placement_status', { placed: false });
        }

        const placement = result.rows[0];
        res.render('placement_status', { placed: true, company: placement.company_name, date: placement.date_of_offer });

    } catch (err) {
        console.error(err);
        res.send('Error fetching placement status.');
    }
});

app.get('/admin', (req, res) => {
    // No login check for now; can add later
    res.render('admin_dashboard');
});

app.get('/admin/students', async (req, res) => {
    const result = await pool.query('SELECT * FROM Student');
    res.render('admin_students', { students: result.rows });
});

app.get('/admin/applications', async (req, res) => {
    const result = await pool.query(`
        SELECT s.name AS student_name, c.name AS company_name, a.status
        FROM Application a
        JOIN Student s ON a.student_id = s.student_id
        JOIN Company c ON a.company_id = c.company_id
    `);
    res.render('admin_applications', { apps: result.rows });
});

app.get('/admin/placements', async (req, res) => {
    const result = await pool.query(`
        SELECT s.name AS student_name, c.name AS company_name, p.date_of_offer
        FROM Placement p
        JOIN Student s ON p.student_id = s.student_id
        JOIN Company c ON p.company_id = c.company_id
    `);
    res.render('admin_placements', { placements: result.rows });
});


app.get('/company_register', (req, res) => {
    res.sendFile(__dirname + '/public/company_register.html');
});

app.post('/company_register', async (req, res) => {
    const { name, role, package, criteria, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        await pool.query(
            'INSERT INTO Company (name, role_offered, package, eligibility_criteria, password) VALUES ($1, $2, $3, $4, $5)',
            [name, role, package, criteria, hashedPassword]
        );
        res.redirect('/company_login');
    } catch (err) {
        console.error(err);
        res.send('Company registration failed');
    }
});


app.get('/company_login', (req, res) => {
    res.sendFile(__dirname + '/public/company_login.html');
});

app.post('/company_login', async (req, res) => {
    const { name, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM Company WHERE name = $1', [name]);
        if (result.rows.length === 0) return res.send('Company not found');
        const company = result.rows[0];
        const match = await bcrypt.compare(password, company.password);
        if (match) {
            req.session.companyId = company.company_id;
            res.redirect('/company_dashboard');
        } else {
            res.send('Incorrect password');
        }
    } catch (err) {
        console.error(err);
        res.send('Login error');
    }
});


app.get('/company_dashboard', async (req, res) => {
    if (!req.session.companyId) return res.redirect('/company_login');
    const company = await pool.query('SELECT * FROM Company WHERE company_id = $1', [req.session.companyId]);
    res.render('company_dashboard', { company: company.rows[0] });
});


app.get('/company_applications', async (req, res) => {
    if (!req.session.companyId) return res.redirect('/company_login');

    try {
        // Fetch applications
        const appsResult = await pool.query(`
            SELECT s.name, s.email, a.status, s.student_id
            FROM Application a
            JOIN Student s ON a.student_id = s.student_id
            WHERE a.company_id = $1
        `, [req.session.companyId]);

        // Fetch all students with resumes
        const studentsResult = await pool.query(`
            SELECT s.student_id, s.name, r.file_path
            FROM Student s
            LEFT JOIN Resume r ON s.student_id = r.student_id
        `);

        res.render('company_applications', {
            apps: appsResult.rows,
            students: studentsResult.rows // ✅ now students is passed
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading company applications');
    }
});


app.get('/download-resume/:filename', (req, res) => {
    const filename = path.basename(req.params.filename); 
    const filePath = path.join(__dirname, 'uploads', filename);

    res.download(filePath, err => {
        if (err) {
                 res.status(404).send('File not found');
     }
    });
});



app.post('/update_status', async (req, res) => {
    if (!req.session.companyId) return res.redirect('/company_login');
    const { student_id, status } = req.body;
    try {
        await pool.query(
            'UPDATE Application SET status = $1 WHERE student_id = $2 AND company_id = $3',
            [status, student_id, req.session.companyId]
        );
        res.redirect('/company_applications');
    } catch (err) {
        console.error(err);
        res.send('Error updating status');
    }
});


app.get('/admin/place', async (req, res) => {
    const result = await pool.query(`
        SELECT a.application_id, s.name AS student_name, c.name AS company_name, a.student_id, c.company_id
        FROM Application a
        JOIN Student s ON a.student_id = s.student_id
        JOIN Company c ON a.company_id = c.company_id
        WHERE a.status = 'Accepted'
    `);
    res.render('admin_place_offer', { offers: result.rows });
});


app.post('/admin/mark_placement', async (req, res) => {
    const { student_id, company_id } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    try {
        // Prevent duplicate placement
        const check = await pool.query(
            'SELECT * FROM Placement WHERE student_id = $1 AND company_id = $2',
            [student_id, company_id]
        );
        if (check.rows.length > 0) {
            return res.send('Already marked. <a href="/admin/place">Back</a>');
        }

        await pool.query(
            'INSERT INTO Placement (student_id, company_id, date_of_offer) VALUES ($1, $2, $3)',
            [student_id, company_id, today]
        );
        res.redirect('/admin/placements');
    } catch (err) {
        console.error(err);
        res.send('Error marking placement');
    }
});


const { Parser } = require('json2csv');
const fs = require('fs');

app.get('/admin/export/:type', async (req, res) => {
    const type = req.params.type;
    let query = '';
    let filename = '';
    
    if (type === 'students') {
        query = 'SELECT * FROM Student';
        filename = 'students.csv';
    } else if (type === 'applications') {
        query = `
            SELECT s.name AS student_name, c.name AS company_name, a.status
            FROM Application a
            JOIN Student s ON a.student_id = s.student_id
            JOIN Company c ON a.company_id = c.company_id`;
        filename = 'applications.csv';
    } else if (type === 'placements') {
        query = `
            SELECT s.name AS student_name, c.name AS company_name, p.date_of_offer
            FROM Placement p
            JOIN Student s ON p.student_id = s.student_id
            JOIN Company c ON p.company_id = c.company_id`;
        filename = 'placements.csv';
    } else {
        return res.send('Invalid type');
    }

    try {
        const result = await pool.query(query);
        const parser = new Parser();
        const csv = parser.parse(result.rows);
        res.attachment(filename);
        res.status(200).send(csv);
    } catch (err) {
        console.error(err);
        res.send('CSV export error');
    }
});


const ADMIN_USER = 'admin';
const ADMIN_PASS = 'password123'; // change this

// Protect admin routes
app.use('/admin', (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.redirect('/admin_login');
});


app.get('/admin_login', (req, res) => {
    res.sendFile(__dirname + '/public/admin_login.html');
});

app.post('/admin_login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM Admin WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.send('Admin not found');
        const admin = result.rows[0];
        const match = await bcrypt.compare(password, admin.password);
        if (match) {
            req.session.isAdmin = true;
            res.redirect('/admin');
        } else {
            res.send('Incorrect password');
        }
    } catch (err) {
        console.error(err);
        res.send('Error during admin login');
    }
});






app.get('/admin_logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});


app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});









// Storage configuration for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // The 'uploads/' folder is where files will be saved.
    // Make sure this folder exists in your project directory.
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Create a unique filename to prevent overwriting files.
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// Now, this line will work because 'storage' is defined above it.
const upload = multer({ storage: storage });

app.post("/upload-resume", upload.single("resume"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  try {
    const studentId = req.session.userId; // make sure session has userId
    const filename = req.file.filename; // just the file name, e.g., 1758963138765.pdf

    // Check if resume exists
    const existing = await pool.query('SELECT * FROM resume WHERE student_id=$1', [studentId]);

    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE resume SET file_path=$1 WHERE student_id=$2',
        [filename, studentId] // ✅ use filename here
      );
    } else {
      await pool.query(
        'INSERT INTO resume (student_id, file_path) VALUES ($1, $2)',
        [studentId, filename] // ✅ use filename here
      );
    }

    res.send("Resume uploaded successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving resume to database");
  }
});


