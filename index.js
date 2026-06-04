const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises; // Use native fs promises
const fsSync = require('fs');      // Use native sync fs for ensuring dirs
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const QRCode = require('qrcode');
const gTTS = require('gtts');
const { clerkMiddleware } = require('@clerk/express');

// Load environment variables (Prioritize .env.local)
const resultLocal = require('dotenv').config({ path: '.env.local' });
if (resultLocal.error) {
    console.log("⚠️ .env.local not found, trying default .env");
    require('dotenv').config();
} else {
    console.log("✅ Loaded config from .env.local");
}

// Debugging: Log if keys are missing (without revealing secrets)
// Vercel might not have the file, so checking process.env is crucial
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    console.error("❌ ERROR: Clerk Keys are missing! Check Vercel Environment Variables or .env.local");
} else {
    console.log("✅ Clerk Configuration Loaded");
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Dynamic SEO Sitemap and Robots endpoints (registered before static files so they intercept them)
app.get('/robots.txt', async (req, res) => {
    try {
        const robotsPath = path.join(process.cwd(), 'seo', 'robots.txt');
        let content = await fs.readFile(robotsPath, 'utf8');
        const host = req.headers.host;
        content = content.replace(/webtigo\.vercel\.app/g, host);
        res.header('Content-Type', 'text/plain');
        res.send(content);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading robots.txt');
    }
});

app.get('/sitemap.xml', async (req, res) => {
    try {
        const sitemapPath = path.join(process.cwd(), 'seo', 'sitemap.xml');
        let content = await fs.readFile(sitemapPath, 'utf8');
        const host = req.headers.host;
        content = content.replace(/webtigo\.vercel\.app/g, host);
        res.header('Content-Type', 'application/xml');
        res.send(content);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading sitemap.xml');
    }
});

app.get('/sitemap1.xml', async (req, res) => {
    try {
        const sitemapPath = path.join(process.cwd(), 'seo', 'sitemap1.xml');
        let content = await fs.readFile(sitemapPath, 'utf8');
        const host = req.headers.host;
        content = content.replace(/webtigo\.vercel\.app/g, host);
        res.header('Content-Type', 'application/xml');
        res.send(content);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading sitemap1.xml');
    }
});

// Explicit absolute path for static files
app.use(express.static(path.join(process.cwd(), 'public')));

// Clerk Middleware (MUST be before routes that need auth)
// Wrap in a key check to prevent server errors (500) if environment variables are not configured in Vercel.
const isNetlify = process.env.NETLIFY === 'true';
const hasClerkKeys = !isNetlify && !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY) && !!process.env.CLERK_SECRET_KEY;

if (hasClerkKeys) {
    app.use(clerkMiddleware({
        publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY,
        secretKey: process.env.CLERK_SECRET_KEY
    }));
} else {
    if (isNetlify) {
        console.log("ℹ️ Clerk auth middleware bypassed on Netlify to prevent redirect loops.");
    } else {
        console.warn("⚠️ WARNING: Clerk Keys are missing. Auth middleware is disabled, and users will not be able to sign in.");
    }
    // Fallback middleware to mock auth object so templates don't crash
    app.use((req, res, next) => {
        req.auth = { userId: null };
        next();
    });
}

// Templating Engine (Next.js-style)
app.use(expressLayouts);
// Explicit absolute path for views
app.set('views', path.join(process.cwd(), 'views'));
app.set('view engine', 'ejs');
app.set('layout', './layout'); // looks for views/layout.ejs

const os = require('os');
// File Upload Config (Memory storage for Serverless robustness)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

// Helper to extract Clerk Frontend API domain from publishable key
function getClerkFrontendApi(publishableKey) {
    if (!publishableKey) return null;
    const parts = publishableKey.split('_');
    if (parts.length < 3) return null;
    const encoded = parts[2];
    try {
        const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(base64, 'base64').toString('utf-8');
        return decoded.replace(/\$$/, '');
    } catch (e) {
        console.error("Error decoding Clerk publishable key:", e);
        return null;
    }
}

// --- LEGACY REDIRECTS (SEO) ---
// Global View Variables
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.clerkPublishableKey = isNetlify ? null : (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY);
    res.locals.clerkFrontendApi = isNetlify ? null : getClerkFrontendApi(res.locals.clerkPublishableKey);
    res.locals.auth = req.auth; // Available from clerkMiddleware

    // Determine protocol and host dynamically for canonical URLs
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers.host;
    res.locals.siteUrl = `${protocol}://${host}`;

    // Redirects were removed as they are no longer needed
    next();
});

// --- VIEW ROUTES (Next.js Pages) ---

app.get('/', (req, res) => {
    res.render('pages/index', {
        title: 'Webtigo - Free Online PDF, Image & Audio Tools',
        description: 'Access free, premium-grade web tools. Convert PDF to JPG, compress images, generate QR codes, and convert text to speech. No registration required.',
        keywords: 'free online tools, pdf converter, image compressor, qr code generator, text to speech, webtigo, online utilities'
    });
});

app.get('/blog', (req, res) => {
    res.render('pages/blog', {
        title: 'Blog - Webtigo',
        description: 'Read the latest guides, tutorials and insights from Webtigo. Discover how to use our tools effectively.',
        keywords: 'webtigo blog, guides, tutorials, web tools, sound frequencies'
    });
});

app.get('/blog/frequency-generator', (req, res) => {
    res.render('pages/blog-frequency-generator', {
        title: 'The Ultimate Guide to Sound Frequencies - Webtigo Blog',
        description: 'Sound is more than just what we hear—it is a physical force. Learn what frequency is, how it works, and explore the universe of sound.',
        keywords: 'frequency guide, sound frequency blog, what is frequency, 432 hz, binaural beats'
    });
});

app.get('/blog/frequency-detector', (req, res) => {
    res.render('pages/blog-frequency-detector', {
        title: 'Unlocking the Hidden Language of Sound - Webtigo Blog',
        description: 'Discover how frequency detectors work. Tune instruments, visualize audio, and find phantom hums with our ultimate guide.',
        keywords: 'frequency detector guide, how frequency detector works, audio visualizer'
    });
});

app.get('/blog/tts', (req, res) => {
    res.render('pages/blog-tts', {
        title: 'Giving Your Words a Voice - Webtigo Blog',
        description: 'Learn how to generate perfect AI speech using the Webtigo Text-to-Speech tool. Master accents, punctuation, and social media AI voices.',
        keywords: 'text to speech guide, AI voice generator, how to use tts, punctuation tts, text to speech accents'
    });
});

app.get('/blog/images-to-pdf', (req, res) => {
    res.render('pages/blog-images-to-pdf', {
        title: 'The Ultimate Guide to Webtigo’s Image to PDF Converter - Webtigo Blog',
        description: 'Learn how to turn messy image galleries into perfectly ordered PDF documents. Great for students, makers, and organizing your files.',
        keywords: 'image to pdf guide, how to make pdf from images, jpg to pdf, organizing receipts, pdf converter'
    });
});

app.get('/blog/pdf-to-images', (req, res) => {
    res.render('pages/blog-pdf-to-images', {
        title: 'Free Your Photos: The Ultimate Guide to the Webtigo PDF to Image Converter - Webtigo Blog',
        description: 'Learn how to extract high-quality PNGs and JPGs from any PDF file without taking blurry screenshots. Perfect for social media and web development.',
        keywords: 'pdf to image guide, pdf extractor, convert pdf to png, how to put pdf on instagram, pdf to jpg high quality'
    });
});

app.get('/blog/compressor', (req, res) => {
    res.render('pages/blog-compressor', {
        title: 'Shrink the Size, Keep the Quality: The Ultimate Guide to the Webtigo Image Compressor - Webtigo Blog',
        description: 'Reduce image file sizes instantly without losing quality. Perfect for meeting upload limits, speeding up websites, and saving hard drive space.',
        keywords: 'image compressor guide, reduce photo size online, compress jpg, compress png, optimize images for web'
    });
});

app.get('/blog/resizer', (req, res) => {
    res.render('pages/blog-resizer', {
        title: 'Pixel Perfect Every Time: The Ultimate Guide to the Webtigo Image Resizer - Webtigo Blog',
        description: 'Take control of your image dimensions. Get the perfect pixels for YouTube thumbnails, Instagram posts, and official passport photos instantly.',
        keywords: 'image resizer guide, resize photo pixels, 1080x1080, youtube thumbnail size, resize image for web'
    });
});

app.get('/blog/qrcode', (req, res) => {
    res.render('pages/blog-qrcode', {
        title: 'The Magic Square: The Ultimate Guide to the Webtigo QR Code Generator - Webtigo Blog',
        description: 'Instantly generate QR codes for URLs, social media profiles, or secret text messages. Completely free, no software required.',
        keywords: 'qr code generator, create qr code free, text qr code, url to qr code, scan qr code online'
    });
});

app.get('/blog/case-converter', (req, res) => {
    res.render('pages/blog-case-converter', {
        title: 'Master Your Text: The Ultimate Guide to the Webtigo Case Converter - Webtigo Blog',
        description: 'Instantly transform text between UPPERCASE, lowercase, Title Case, and more. Perfect for fixing caps lock errors and formatting code variables.',
        keywords: 'case converter guide, change text case, uppercase to lowercase, title case online, camelCase, snake_case'
    });
});

app.get('/blog/somi-wahal', (req, res) => {
    res.render('pages/blog-somi-wahal', {
        title: 'Somi Wahal: Travel Blogger, Writer & Digital Creator - Webtigo Blog',
        description: 'Discover the journey of Somi Wahal, a prominent travel blogger and digital creator. Learn about her influence and creative work in the digital space.',
        keywords: 'Somi Wahal, travel blogger, digital creator, social media strategist, content creator'
    });
});

app.get('/signin', (req, res) => {
    res.render('pages/signin', {
        title: 'Sign In - Webtigo',
        description: 'Sign in to access premium Webtigo features and personalized tools.',
        keywords: 'signin, login, webtigo account'
    });
});

app.get('/tts', (req, res) => {
    res.render('pages/tts', {
        title: 'Free Text to Speech Converter - Download MP3 Audio | Webtigo',
        description: 'Convert text into natural-sounding speech instantly. Support for multiple accents and speeds. Download your audio as an MP3 file for free.',
        keywords: 'webtigo, webtigo tts, text to speech, tts converter, text to mp3, read aloud online, free voice generator, natural sounding tts'
    });
});

app.get('/compressor', (req, res) => {
    res.render('pages/compressor', {
        title: 'Image Compressor - Reduce JPG & PNG Size Online | Webtigo',
        description: 'Compress JPG and PNG images online without losing quality. Reduce file size for faster websites and easier sharing. Free and secure.',
        keywords: 'webtigo, webtigo image compressor, image compressor, compress jpeg, compress png, reduce image size, online image optimizer, shrink image file'
    });
});

app.get('/qrcode', (req, res) => {
    res.render('pages/qrcode', {
        title: 'Free QR Code Generator - Create & Download Custom QRs | Webtigo',
        description: 'Generate high-quality QR codes for URLs, text, Wi-Fi, and email. Instant creation with no expiration. Download as PNG.',
        keywords: 'webtigo, webtigo qr code, qr code generator, create qr code, free qr maker, custom qr code, url to qr, wifi qr code'
    });
});

app.get('/resizer', (req, res) => {
    res.render('pages/resizer', {
        title: 'Image Resizer - Change JPG & PNG Dimensions Online | Webtigo',
        description: 'Resize images to exact pixel dimensions (width & height). Perfect for social media, passports, and web content. Fast and free.',
        keywords: 'webtigo, webtigo image resizer, image resizer, resize jpg, resize png, change photo size, online photo editor, pixel resizer'
    });
});

app.get('/frequency', (req, res) => {
    res.render('pages/frequency', {
        title: 'Online Tone Generator - Generate Pure Sine & Square Waves | Webtigo',
        description: 'Free online frequency generator. Create pure Sine, Square, Sawtooth, and Triangle waves from 20Hz to 20kHz. Test audio equipment and hearing.',
        keywords: 'webtigo, webtigo frequency generator, frequency generator, tone generator, online hz generator, sound test, audio oscillator, sine wave generator'
    });
});

app.get('/frequency-detector', (req, res) => {
    res.render('pages/frequency-detector', {
        title: 'Frequency Detector - Analyze Pitch & Tones Online | Webtigo',
        description: 'Free online frequency and pitch detector. Detect real-time frequencies from your microphone or find constant sustained tones. Test your voice or instruments.',
        keywords: 'webtigo, webtigo frequency detector, frequency detector, pitch detector, find frequency, detect tone, online tuner, microphone frequency analyzer'
    });
});

app.get('/case-converter', (req, res) => {
    res.render('pages/case-converter', {
        title: 'Case Converter Tool - Uppercase, Lowercase & Title Case | Webtigo',
        description: 'Instantly convert text between Uppercase, Lowercase, Title Case, and Sentence Case. Copy to clipboard with one click.',
        keywords: 'webtigo, webtigo case converter, case converter, uppercase to lowercase, title case generator, text capitalization, sentence case tool'
    });
});

app.get('/images-to-pdf', (req, res) => {
    res.render('pages/images-to-pdf', {
        title: 'JPG to PDF Converter - Merge Images into One PDF | Webtigo',
        description: 'Convert and merge JPG or PNG images into a single PDF document. Drag and drop, reorder pages, and download instantly.',
        keywords: 'webtigo, webtigo images to pdf, images to pdf, jpg to pdf, png to pdf, combine photos to pdf, free pdf converter, merge images'
    });
});

app.get('/pdf-to-images', (req, res) => {
    res.render('pages/pdf-to-images', {
        title: 'PDF to JPG Converter - Extract Pages as Images | Webtigo',
        description: 'Extract every page from a PDF file as a high-quality JPG image. Download all pages as a ZIP file. Fast, free, and private.',
        keywords: 'webtigo, webtigo pdf to images, pdf to images, pdf to jpg, extract pdf pages, convert pdf to image, pdf to zip, free pdf tool'
    });
});

app.get('/privacy', (req, res) => {
    res.render('pages/privacy', {
        title: 'Privacy Policy - Webtigo',
        description: 'Read the Webtigo Privacy Policy. Learn how we handle your data, our use of Google AdSense cookies, and Clerk authentication.',
        keywords: 'privacy policy, webtigo privacy, data protection, cookies'
    });
});

app.get('/terms', (req, res) => {
    res.render('pages/terms', {
        title: 'Terms of Service - Webtigo',
        description: 'Read the Webtigo Terms of Service. Understand our as-is service provision and data retention policy for uploaded files.',
        keywords: 'terms of service, webtigo terms, user agreement, data retention'
    });
});

app.get('/about', (req, res) => {
    res.render('pages/about', {
        title: 'About Us - Webtigo',
        description: 'Learn about Webtigo. We provide free, premium web tools for everyday tasks like PDF creation, image compression, and more.',
        keywords: 'about webtigo, free web tools, premium utilities, webtigo mission'
    });
});

app.get('/contact', (req, res) => {
    res.render('pages/contact', {
        title: 'Contact Us - Webtigo',
        description: 'Get in touch with the Webtigo team for support, questions, or feedback regarding our free web tools.',
        keywords: 'contact webtigo, webtigo support, help, customer service'
    });
});

app.get('/social-media', (req, res) => {
    res.render('pages/social-media', {
        title: 'Social Media & Collaborations - Webtigo',
        description: 'Connect with us on social media and explore our collaborations with talented creators.',
        keywords: 'social media, collaborations, webtigo community, content creators'
    });
});

app.get('/my-channel', (req, res) => {
    res.render('pages/my-channel', {
        title: 'My Channel - Member of Multivers | Webtigo',
        description: 'Official channel of Member of Multivers. Explore frequency tutorials, QR code guides, and tech explorations.',
        keywords: 'Member of Multivers, YouTube channel, frequency generator tutorials, tech blog'
    });
});

app.get('/collaborators', (req, res) => {
    res.render('pages/collaborators', {
        title: 'Our Collaborators - Webtigo',
        description: 'Meet the talented creators we collaborate with, featuring Somi Wahal and Super GK.',
        keywords: 'collaborators, Somi Wahal, Super GK, digital influencers, social media partnership'
    });
});

// --- API ROUTES (Serverless Processing) ---

// 1. Image Compressor
app.post('/api/compress-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No image uploaded');
        const targetSizeKB = parseInt(req.body.size_kb, 10) || 50;
        let quality = 95;
        let buffer = req.file.buffer;

        while (buffer.length > targetSizeKB * 1024 && quality > 10) {
            buffer = await sharp(req.file.buffer).jpeg({ quality }).toBuffer();
            quality -= 10;
        }

        const filename = `compressed_${uuidv4()}.jpg`;
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).send('Compression Failed');
    }
});

// 2. Image Resizer
app.post('/api/resize-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No image uploaded');
        const width = parseInt(req.body.width) || 300;
        const height = parseInt(req.body.height) || 300;

        const buffer = await sharp(req.file.buffer)
            .resize(width, height, { fit: 'cover' })
            .jpeg({ quality: 90 })
            .toBuffer();

        const filename = `resized_${uuidv4()}.jpg`;
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).send('Resize Failed');
    }
});

// 3. QR Code
app.post('/api/generate-qr', upload.none(), async (req, res) => {
    try {
        const { data } = req.body;
        if (!data) return res.status(400).send('No data provided');
        const buffer = await QRCode.toBuffer(data, { width: 300 });
        const filename = `qr_${uuidv4()}.png`;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).send('QR Gen Failed');
    }
});

// 4. TTS
app.post('/api/speak', upload.none(), async (req, res) => {
    try {
        const { text, speed, accent } = req.body;
        if (!text) return res.status(400).send('No text');
        const lang = accent || 'en';
        const slow = speed === 'slow';
        const filename = `tts_${uuidv4()}.mp3`;

        // Vercel allows writing to /tmp
        const tempPath = path.join(os.tmpdir(), filename);

        const tts = new gTTS(text, lang, slow);
        tts.save(tempPath, async (err) => {
            if (err) return res.status(500).send('TTS Failed');
            const buffer = await fs.readFile(tempPath);
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(buffer);
            try { await fs.rm(tempPath, { force: true }); } catch (e) { }
        });
    } catch (err) {
        res.status(500).send('TTS Error');
    }
});




// 5. Static Sitemaps fallback check (if not in public dir)
// Express already serves static files from 'public' via express.static.
// We remove the dynamic routes so you can place sitemap.xml and sitemap1.xml directly in the 'public' folder.

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`http://localhost:${PORT}`);
    });
}

// Global Error Handler for debugging
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send(`<pre>DEBUG ERROR: ${err.message}\n${err.stack}</pre>`);
});

module.exports = app;
