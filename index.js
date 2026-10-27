const express = require('express');
const compression = require('compression');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs').promises; // Use native fs promises
const fsSync = require('fs');      // Use native sync fs for ensuring dirs
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const QRCode = require('qrcode');
const gTTS = require('gtts');
const { clerkMiddleware } = require('@clerk/express');

// Safe path resolution helper across local dev, Docker, Vercel, and Netlify AWS Lambda serverless functions
const resolveAppPath = (...subpaths) => {
    const candidates = [
        path.join(__dirname, ...subpaths),
        path.join(__dirname, '..', ...subpaths),
        path.join(process.cwd(), ...subpaths),
        process.env.LAMBDA_TASK_ROOT ? path.join(process.env.LAMBDA_TASK_ROOT, ...subpaths) : null,
        '/var/task' ? path.join('/var/task', ...subpaths) : null
    ].filter(Boolean);

    for (const cand of candidates) {
        if (fsSync.existsSync(cand)) {
            return cand;
        }
    }
    return path.join(process.cwd(), ...subpaths);
};

// Load environment variables (Prioritize .env.local)
const resultLocal = require('dotenv').config({ path: '.env.local' });
if (resultLocal.error) {
    require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// High-speed compression middleware (compresses all text/html/json/css/js responses)
app.use(compression({
    level: 6,
    threshold: 1024
}));

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Dynamic SEO Sitemap and Robots endpoints (registered before static files so they intercept them)
app.get('/robots.txt', async (req, res) => {
    try {
        const robotsPath = resolveAppPath('seo', 'robots.txt');
        let content = await fs.readFile(robotsPath, 'utf8');
        const host = req.headers.host || 'webtigo.netlify.app';
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
        const sitemapPath = resolveAppPath('seo', 'sitemap.xml');
        let content = await fs.readFile(sitemapPath, 'utf8');
        const host = req.headers.host || 'webtigo.netlify.app';
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
        const sitemapPath = resolveAppPath('seo', 'sitemap1.xml');
        let content = await fs.readFile(sitemapPath, 'utf8');
        const host = req.headers.host || 'webtigo.netlify.app';
        content = content.replace(/webtigo\.vercel\.app/g, host);
        res.header('Content-Type', 'application/xml');
        res.send(content);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading sitemap1.xml');
    }
});

// Favicon and Manifest dedicated endpoints for Googlebot and browser crawlers
app.get('/favicon.ico', (req, res) => {
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(resolveAppPath('public', 'favicon.ico'));
});

app.get('/favicon-48x48.png', (req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(resolveAppPath('public', 'favicon-48x48.png'));
});

app.get('/favicon-96x96.png', (req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(resolveAppPath('public', 'favicon-96x96.png'));
});

app.get('/favicon-192x192.png', (req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(resolveAppPath('public', 'favicon-192x192.png'));
});

app.get('/site.webmanifest', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(resolveAppPath('public', 'site.webmanifest'));
});

// Dedicated /llms.txt endpoint for LLM Search Engine indexation (Perplexity, GPTBot, Claude)
app.get('/llms.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(resolveAppPath('public', 'llms.txt'));
});

// Explicit absolute path for static files with caching for fast repeat loads
app.use(express.static(resolveAppPath('public'), {
    maxAge: '7d',
    etag: true
}));

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
        return null;
    }
}

// Clerk Authentication Middleware setup - optimized for instant sub-millisecond public page rendering
const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecKey = process.env.CLERK_SECRET_KEY;
const hasClerkKeys = !!(clerkPubKey && clerkSecKey);

if (hasClerkKeys) {
    // Non-blocking Clerk middleware: only authenticate on explicit auth routes to avoid network token roundtrips and dev-browser redirects on public tool pages
    app.use((req, res, next) => {
        if (req.path === '/signin' || req.path.startsWith('/api/auth')) {
            return clerkMiddleware({
                publishableKey: clerkPubKey,
                secretKey: clerkSecKey
            })(req, res, next);
        }
        req.auth = { userId: null };
        next();
    });
} else {
    // Fallback middleware to mock auth object so templates don't crash
    app.use((req, res, next) => {
        req.auth = { userId: null };
        next();
    });
}

// Templating Engine setup
app.use(expressLayouts);
app.set('views', resolveAppPath('views'));
app.set('view engine', 'ejs');
app.set('layout', './layout');

const os = require('os');
// File Upload Config (Memory storage for Serverless robustness)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

// Unified User Session & View Variables (combines Clerk & serverless cookie session)
app.use((req, res, next) => {
    let currentUser = null;

    // 1. Check for cookie session (built-in auth)
    if (req.cookies && req.cookies.webtigo_user) {
        try {
            currentUser = typeof req.cookies.webtigo_user === 'string'
                ? JSON.parse(req.cookies.webtigo_user)
                : req.cookies.webtigo_user;
        } catch (e) {
            currentUser = null;
        }
    }

    // 2. Check if Clerk authenticated
    if (!currentUser && req.auth && req.auth.userId) {
        currentUser = {
            id: req.auth.userId,
            name: 'Clerk Member',
            email: 'clerk-user',
            role: 'member',
            provider: 'clerk'
        };
    }

    req.user = currentUser;
    res.locals.user = currentUser;
    res.locals.currentPath = req.path;
    res.locals.clerkPublishableKey = clerkPubKey || null;
    res.locals.clerkFrontendApi = getClerkFrontendApi(clerkPubKey);
    res.locals.auth = req.auth || { userId: currentUser ? currentUser.id : null };

    // Determine protocol and host dynamically for canonical URLs
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers.host || 'webtigo.netlify.app';
    res.locals.siteUrl = `${protocol}://${host}`;

    next();
});

// --- VIEW ROUTES (Next.js Pages) ---

app.get('/', (req, res) => {
    res.render('pages/index', {
        title: 'Webtigo - Free Online QR Code Generator, Image & Audio Tools',
        description: 'Access free, premium web utilities on Webtigo created by Aaditya Wahal in India: Webtigo QR Code Generator, Image Compressor, Resizer, Audio Frequencies, and Endless Sync Canvas.',
        keywords: 'webtigo, webtigo qr code generator, qr code generator, webtigo tools, free online tools, image compressor, image resizer, text to speech, endless sync, aaditya wahal'
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
        title: 'Free Your Photos: The Ultimate Guide to the Webtigo PDF to Image Converter',
        description: 'Learn how to extract high-quality PNGs and JPGs from any PDF file without taking blurry screenshots. Perfect for social media and web development.',
        keywords: 'pdf to image guide, pdf extractor, convert pdf to png, how to put pdf on instagram, pdf to jpg high quality'
    });
});

app.get('/blog/compressor', (req, res) => {
    res.render('pages/blog-compressor', {
        title: 'Shrink the Size, Keep the Quality: The Ultimate Guide to the Webtigo Image Compressor',
        description: 'Reduce image file sizes instantly without losing quality. Perfect for meeting upload limits, speeding up websites, and saving hard drive space.',
        keywords: 'image compressor guide, reduce photo size online, compress jpg, compress png, optimize images for web'
    });
});

app.get('/blog/resizer', (req, res) => {
    res.render('pages/blog-resizer', {
        title: 'Pixel Perfect Every Time: The Ultimate Guide to the Webtigo Image Resizer',
        description: 'Take control of your image dimensions. Get the perfect pixels for YouTube thumbnails, Instagram posts, and official passport photos instantly.',
        keywords: 'image resizer guide, resize photo pixels, 1080x1080, youtube thumbnail size, resize image for web'
    });
});

app.get('/blog/qrcode', (req, res) => {
    res.render('pages/blog-qrcode', {
        title: 'The Magic Square: The Ultimate Guide to the Webtigo QR Code Generator',
        description: 'Instantly generate QR codes for URLs, social media profiles, or secret text messages with Webtigo. Completely free, no software required.',
        keywords: 'webtigo qr code generator, qr code generator, create qr code free, text qr code, url to qr code, scan qr code online'
    });
});

app.get('/blog/case-converter', (req, res) => {
    res.render('pages/blog-case-converter', {
        title: 'Master Your Text: The Ultimate Guide to the Webtigo Case Converter',
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

app.get('/blog/noble-polyhedron', (req, res) => {
    res.render('pages/blog-noble-polyhedron', {
        title: 'The Story Of Noble Polyhedron: Exploring The Hidden Realm Of Absolute Symmetry - Webtigo Blog',
        description: 'Explore the fascinating world of noble polyhedra: isohedral and isogonal 3D geometries, Kepler-Poinsot star polyhedra, crown stephanoids, and noble toroids.',
        keywords: 'noble polyhedron, noble polyhedra, isohedral, isogonal, platonic solids, kepler poinsot, stephanoids, infinite apeirohedron, 3d geometry, webtigo blog'
    });
});

app.get('/blog/endlessync-guide', (req, res) => {
    res.render('pages/blog-endlessync-guide', {
        title: 'The User Guide to Endlessync (Webtigo Infinity Canvas) - Webtigo Blog',
        description: 'Comprehensive manual for Endlessync: infinite navigation, real-time vector sketching, live thought placement, asset management, and global collaboration etiquette.',
        keywords: 'Endlessync, Endless Sync, Webtigo Infinity Canvas, infinite canvas guide, real-time whiteboard, global collaborative mural, vector sketching, live collaboration'
    });
});

app.get('/blog/endlessync-story', (req, res) => {
    res.render('pages/blog-endlessync-story', {
        title: 'The Midnight Spark Behind Endless Sync - Webtigo Blog',
        description: 'The story behind Endless Sync: from a 3 AM idea and Weptigo Infinity Canvas to rebuilding during Navratri 2026 with real-time global synchronization.',
        keywords: 'Endless Sync story, Endlessync origin, Weptigo Infinity Canvas, Navratri 2026, real time sync canvas, Aaditya Wahal, Webtigo blog'
    });
});

app.get('/blog/endlessync-games', (req, res) => {
    res.render('pages/blog-endlessync-games', {
        title: 'How I Thought of Adding Games in Endlessync - Webtigo Blog',
        description: 'How an accidental game of Tic-Tac-Toe during latency testing inspired built-in games on Endlessync, making the infinite canvas a shared place for play and hanging out.',
        keywords: 'Endlessync games, endless sync games, tic tac toe canvas, connect four infinite canvas, dots and boxes whiteboard, aaditya wahal, webtigo blog'
    });
});

app.get('/blog/pdf-combiner', (req, res) => {
    res.render('pages/blog-pdf-combiner', {
        title: 'How Everyday Frustration Built the Webtigo PDF Combiner - Webtigo Blog',
        description: 'The personal story behind the new Webtigo PDF Combiner: solving real-world document fragmentation and civic record searches.',
        keywords: 'pdf combiner story, why we built pdf combiner, webtigo pdf combiner, merge pdf files, aaditya wahal, webtigo blog'
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
        description: 'Convert text into natural-sounding speech instantly with Webtigo. Multiple voices, accents, and speeds. Download MP3 audio for free.',
        keywords: 'webtigo tts, text to speech, webtigo, tts converter, text to mp3, read aloud online, free voice generator'
    });
});

app.get('/compressor', (req, res) => {
    res.render('pages/compressor', {
        title: 'Image Compressor - Reduce JPG & PNG Size Online | Webtigo',
        description: 'Compress JPG and PNG images online without losing quality on Webtigo. Reduce file size for faster websites and free sharing. 100% private in browser.',
        keywords: 'webtigo image compressor, image compressor, compress jpeg, compress png, webtigo, reduce image size, online image optimizer'
    });
});

app.get('/qrcode', (req, res) => {
    res.render('pages/qrcode', {
        title: 'Webtigo QR Code Generator - Free High-Resolution QR Creator',
        description: 'Create high-resolution custom QR codes instantly with the official Webtigo QR Code Generator. Supports URLs, text, Wi-Fi networks, and contact cards. 100% free, private, engineered by Aaditya Wahal in India.',
        keywords: 'webtigo qr code generator, webtigo qr code, qr code generator, webtigo, free qr creator, url to qr, scan qr code, wifi qr code, qr maker india, aaditya wahal'
    });
});

app.get('/resizer', (req, res) => {
    res.render('pages/resizer', {
        title: 'Image Resizer - Change JPG & PNG Dimensions Online | Webtigo',
        description: 'Resize images to exact pixel dimensions (width & height) on Webtigo. Perfect for YouTube thumbnails, passports, and social media. Fast and free.',
        keywords: 'webtigo image resizer, image resizer, resize jpg, resize png, webtigo, change photo size, pixel resizer'
    });
});

app.get('/frequency', (req, res) => {
    res.render('pages/frequency', {
        title: 'Online Tone Generator - Pure Sine & Square Waves | Webtigo',
        description: 'Free online frequency generator on Webtigo. Create pure Sine, Square, Sawtooth, and Triangle waves from 20Hz to 20kHz.',
        keywords: 'webtigo frequency generator, frequency generator, tone generator, webtigo, audio oscillator, sine wave'
    });
});

app.get('/frequency-detector', (req, res) => {
    res.render('pages/frequency-detector', {
        title: 'Frequency Detector - Analyze Pitch & Tones Online | Webtigo',
        description: 'Free online frequency and pitch detector on Webtigo. Real-time frequency analysis from microphone or sustained tones.',
        keywords: 'webtigo frequency detector, pitch detector, frequency analyzer, webtigo, microphone tuner'
    });
});

app.get('/case-converter', (req, res) => {
    res.render('pages/case-converter', {
        title: 'Case Converter Tool - Uppercase, Lowercase & Title Case | Webtigo',
        description: 'Instantly convert text between Uppercase, Lowercase, Title Case, and Sentence Case on Webtigo. Copy to clipboard with one click.',
        keywords: 'webtigo case converter, case converter, uppercase to lowercase, title case generator, webtigo'
    });
});

app.get('/pdf-combiner', (req, res) => {
    res.render('pages/pdf-combiner', {
        title: 'PDF Combiner - Merge Two or More PDFs Online Free | Webtigo',
        description: 'Combine two or more PDF files into one document in seconds on Webtigo. Fast, secure, client-side merging with drag & drop reordering and zero file limits.',
        keywords: 'pdf combiner, merge pdf, combine pdf files, merge two pdfs, pdf joiner, webtigo pdf combiner, free pdf merger, combine multiple pdfs into one'
    });
});

app.get('/images-to-pdf', (req, res) => {
    res.render('pages/images-to-pdf', {
        title: 'JPG to PDF Converter - Merge Images into One PDF | Webtigo',
        description: 'Convert and merge JPG or PNG images into a single PDF document on Webtigo. Client-side processing with zero server uploads.',
        keywords: 'webtigo images to pdf, images to pdf, jpg to pdf, png to pdf, combine photos to pdf, webtigo'
    });
});

app.get('/pdf-to-images', (req, res) => {
    res.render('pages/pdf-to-images', {
        title: 'PDF to JPG Converter - Extract Pages as Images | Webtigo',
        description: 'Extract every page from a PDF file as a high-quality JPG image on Webtigo. Download all pages as a ZIP file. Fast and secure.',
        keywords: 'webtigo pdf to images, pdf to images, pdf to jpg, extract pdf pages, webtigo'
    });
});

app.get('/privacy', (req, res) => {
    res.render('pages/privacy', {
        title: 'Privacy Policy - Webtigo',
        description: 'Read the Webtigo Privacy Policy. Learn about our client-side privacy-first architecture, cookies, and authentication.',
        keywords: 'privacy policy, webtigo privacy, data protection, cookies'
    });
});

app.get('/terms', (req, res) => {
    res.render('pages/terms', {
        title: 'Terms of Service - Webtigo',
        description: 'Read the Webtigo Terms of Service. Understand our browser-based utility terms and data retention policies.',
        keywords: 'terms of service, webtigo terms, user agreement'
    });
});

app.get('/about', (req, res) => {
    res.render('pages/about', {
        title: 'About Webtigo - Created by Aaditya Wahal in India',
        description: 'Learn about Webtigo, an independent web utilities platform engineered by Aaditya Wahal (Member of Multivers) in India. Free client-side tools with complete user privacy.',
        keywords: 'about webtigo, aaditya wahal, member of multivers, who made webtigo, webtigo creator, where is webtigo based, webtigo india, free web tools'
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
        title: 'My Channel - Member of Multivers',
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

// 5. PDF Combiner API (Server-side processing fallback)
app.post('/api/combine-pdf', upload.array('pdfs', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length < 2) {
            return res.status(400).send('Please provide at least 2 PDF files to combine');
        }
        const { PDFDocument } = require('pdf-lib');
        const mergedPdf = await PDFDocument.create();

        for (const file of req.files) {
            const pdf = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            for (const page of copiedPages) {
                mergedPdf.addPage(page);
            }
        }

        const mergedPdfBytes = await mergedPdf.save();
        const filename = `combined_${uuidv4().substring(0, 8)}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(mergedPdfBytes));
    } catch (err) {
        console.error('PDF Combine error:', err);
        res.status(500).send('Failed to combine PDFs: ' + err.message);
    }
});

// Temporary In-Memory Storage for Instant Share Links (2-hour rolling retention)
const sharedFilesMap = new Map();

// Direct file upload endpoint to generate instant public link for Gmail / Drive
app.post('/api/share/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const fileId = uuidv4().substring(0, 12);
        const originalName = req.file.originalname || `file-${Date.now()}`;
        const fileRecord = {
            id: fileId,
            filename: originalName,
            mimetype: req.file.mimetype || 'application/octet-stream',
            buffer: req.file.buffer,
            size: req.file.size,
            createdAt: Date.now()
        };
        sharedFilesMap.set(fileId, fileRecord);

        // Auto-cleanup after 2 hours
        setTimeout(() => {
            sharedFilesMap.delete(fileId);
        }, 2 * 60 * 60 * 1000);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers.host || 'webtigo.netlify.app';
        const directUrl = `${protocol}://${host}/api/share/file/${fileId}`;

        res.json({
            success: true,
            fileId,
            url: directUrl,
            filename: originalName
        });
    } catch (err) {
        console.error('Share upload error:', err);
        res.status(500).json({ error: 'Failed to create share link' });
    }
});

// Direct file access endpoint (stream inline with proper filename)
app.get('/api/share/file/:id', (req, res) => {
    const fileRecord = sharedFilesMap.get(req.params.id);
    if (!fileRecord) {
        return res.status(404).send('This shared file link has expired or was not found.');
    }
    res.setHeader('Content-Type', fileRecord.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileRecord.filename)}"`);
    res.send(fileRecord.buffer);
});

// 5. Authentication API Routes (Serverless & Local compatible)
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password, mode } = req.body || {};

        if (mode === 'demo' || mode === 'guest') {
            const demoUser = {
                id: 'user_' + uuidv4().substring(0, 8),
                name: mode === 'demo' ? 'Pro Creator' : 'Guest Member',
                email: mode === 'demo' ? 'member@webtigo.app' : 'guest@webtigo.app',
                role: 'premium'
            };
            res.cookie('webtigo_user', JSON.stringify(demoUser), {
                maxAge: 30 * 24 * 60 * 60 * 1000,
                httpOnly: false,
                sameSite: 'lax',
                path: '/'
            });
            return res.json({ success: true, user: demoUser });
        }

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required.' });
        }

        if (password.length < 4) {
            return res.status(400).json({ success: false, error: 'Password must be at least 4 characters.' });
        }

        const baseName = email.split('@')[0];
        const displayName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

        const user = {
            id: 'user_' + uuidv4().substring(0, 8),
            name: displayName,
            email: email.trim().toLowerCase(),
            role: 'member'
        };

        res.cookie('webtigo_user', JSON.stringify(user), {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: false,
            sameSite: 'lax',
            path: '/'
        });

        return res.json({ success: true, user });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, error: 'Login failed' });
    }
});

app.post('/api/auth/signup', (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required.' });
        }

        if (password.length < 4) {
            return res.status(400).json({ success: false, error: 'Password must be at least 4 characters.' });
        }

        const displayName = name && name.trim() ? name.trim() : email.split('@')[0];

        const user = {
            id: 'user_' + uuidv4().substring(0, 8),
            name: displayName,
            email: email.trim().toLowerCase(),
            role: 'member'
        };

        res.cookie('webtigo_user', JSON.stringify(user), {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: false,
            sameSite: 'lax',
            path: '/'
        });

        return res.json({ success: true, user });
    } catch (err) {
        console.error('Signup error:', err);
        return res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('webtigo_user', { path: '/' });
    return res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
    return res.json({
        authenticated: !!req.user,
        user: req.user || null
    });
});

// Start Server
if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`Server running on http://${HOST}:${PORT}`);
    });
}

// Global Error Handler for debugging
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send(`<pre>DEBUG ERROR: ${err.message}\n${err.stack}</pre>`);
});

module.exports = app;
