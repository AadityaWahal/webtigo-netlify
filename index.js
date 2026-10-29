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
// File Upload Config (Memory storage for Serverless robustness - up to 50MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit per file for large raw camera photos and high-res PNGs
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
            name: '',
            email: '',
            picture: null,
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
        title: 'Webtigo',
        description: 'Webtigo is a digital web service providing website and group of websites offering free online tools: Best PDF Combiner, Best QR Code Generator, Best Image Compressor, Text to Speech, Resizer, and Endless Sync Canvas. Engineered by Aaditya Wahal in India.',
        keywords: 'webtigo, webtigo tools, webtigo group, digital web services, webtigo qr code generator, best pdf combiner, best image compressor, text to speech, endless sync, aaditya wahal'
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
        title: 'Best Text to Speech Converter - Natural Voices & Free MP3 | Webtigo',
        description: 'Webtigo is the best free text to speech converter online. Convert text into natural human-sounding audio with multiple languages, accents, and instant MP3 download.',
        keywords: 'best text to speech, best free tts, natural text to speech, text to mp3, read aloud online, AI voice generator, webtigo text to speech, free tts converter'
    });
});

app.get('/compressor', (req, res) => {
    res.render('pages/compressor', {
        title: 'Best Free Image Compressor - Reduce JPG, PNG & WebP Online | Webtigo',
        description: 'Webtigo provides the best free image compressor to reduce JPG, PNG, and WebP file sizes by up to 90% without visible quality loss. 100% private in-browser compression with zero watermarks.',
        keywords: 'best image compressor, best free image compressor, compress jpg, compress png, reduce image size, best photo compressor online, webtigo image compressor, image optimizer'
    });
});

app.get('/qrcode', (req, res) => {
    res.render('pages/qrcode', {
        title: 'Best QR Code Generator - Free High-Resolution QR Creator | Webtigo',
        description: 'Webtigo is the best free QR code generator to create permanent, high-resolution QR codes for websites, text, Wi-Fi, and contacts with unlimited scans, no expiration, and instant PNG download.',
        keywords: 'best qr code generator, best free qr code generator, webtigo qr code generator, create qr code free, permanent qr code, qr maker online, high resolution qr code, free qr creator'
    });
});

app.get('/resizer', (req, res) => {
    res.render('pages/resizer', {
        title: 'Best Image Resizer - Resize JPG & PNG Dimensions Online | Webtigo',
        description: 'Webtigo is the best free image resizer to adjust photo pixel dimensions (width & height) for YouTube thumbnails, social media, and passports without quality loss.',
        keywords: 'best image resizer, resize image online, resize photo pixels, 1080x1080 resizer, passport photo resizer, webtigo image resizer, free picture resizer'
    });
});

app.get('/frequency', (req, res) => {
    res.render('pages/frequency', {
        title: 'Best Online Frequency Generator - Pure Sine & Audio Tone Generator | Webtigo',
        description: 'Webtigo is the best free online audio frequency generator. Generate pure Sine, Square, Sawtooth, and Triangle sound waves from 20Hz to 20kHz.',
        keywords: 'best frequency generator, online tone generator, audio oscillator, sine wave generator, 432 hz generator, webtigo frequency generator'
    });
});

app.get('/frequency-detector', (req, res) => {
    res.render('pages/frequency-detector', {
        title: 'Best Frequency Detector - Real-Time Audio Pitch Analyzer | Webtigo',
        description: 'Webtigo is the best free real-time frequency and pitch detector. Analyze audio pitch, detect frequencies via microphone, and tune instruments online.',
        keywords: 'best frequency detector, pitch detector online, audio analyzer, microphone tuner, detect hz, webtigo frequency detector'
    });
});

app.get('/case-converter', (req, res) => {
    res.render('pages/case-converter', {
        title: 'Best Text Case Converter - Uppercase, Lowercase & Title Case | Webtigo',
        description: 'Webtigo is the best free case converter tool. Instantly convert text between UPPERCASE, lowercase, Title Case, Sentence case, and camelCase with 1-click copy.',
        keywords: 'best case converter, uppercase to lowercase, title case generator, text case converter, change letter case online, webtigo case converter'
    });
});

app.get('/pdf-combiner', (req, res) => {
    res.render('pages/pdf-combiner', {
        title: 'Best PDF Combiner - Merge Two or More PDFs Online Free | Webtigo',
        description: 'Webtigo is the best free PDF combiner online. Merge two or more PDF files into one document in seconds with drag-and-drop reordering, 100% private in-browser merging, zero file size limits, and zero watermarks.',
        keywords: 'best pdf combiner, best free pdf combiner, merge pdf online, combine pdf files, merge two pdfs, pdf joiner, webtigo pdf combiner, free pdf merger, best tool to merge pdf'
    });
});

app.get('/images-to-pdf', (req, res) => {
    res.render('pages/images-to-pdf', {
        title: 'Best Images to PDF Converter - Merge JPG & PNG to PDF Free | Webtigo',
        description: 'Webtigo is the best free images to PDF converter. Merge collections of JPG, PNG, and WebP photos into a clean, organized PDF document in seconds with zero uploads.',
        keywords: 'best images to pdf, jpg to pdf converter, combine photos to pdf, merge images into pdf, free images to pdf converter, webtigo images to pdf'
    });
});

app.get('/pdf-to-images', (req, res) => {
    res.render('pages/pdf-to-images', {
        title: 'Best PDF to Images Converter - Extract PDF Pages as JPG Free | Webtigo',
        description: 'Webtigo provides the best free PDF to images extractor. Extract every page from any PDF into crystal-clear JPG photos and download as a ZIP file instantly.',
        keywords: 'best pdf to images converter, extract pdf pages as jpg, pdf to jpg high quality, convert pdf to images, webtigo pdf to images'
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
app.post('/api/compress-image', (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).send('Image exceeds 50MB limit. Please select a smaller image or use client-side compression.');
            }
            return res.status(400).send('Upload error: ' + err.message);
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No image uploaded');
        const targetSizeKB = parseInt(req.body.size_kb, 10) || 100;
        const requestedFormat = (req.body.format || 'jpg').toLowerCase();

        const img = sharp(req.file.buffer, { failOn: 'none' });
        const metadata = await img.metadata();

        let quality = 88;
        let scale = 1.0;
        let outMime = 'image/jpeg';
        let ext = 'jpg';

        if (requestedFormat === 'png' || (requestedFormat === 'auto' && metadata.format === 'png' && metadata.hasAlpha)) {
            outMime = 'image/png';
            ext = 'png';
        } else if (requestedFormat === 'webp') {
            outMime = 'image/webp';
            ext = 'webp';
        } else {
            outMime = 'image/jpeg';
            ext = 'jpg';
        }

        async function processBuffer(currQuality, currScale) {
            let pipeline = sharp(req.file.buffer, { failOn: 'none' });

            if (currScale < 1.0 && metadata.width && metadata.height) {
                const targetW = Math.max(100, Math.round(metadata.width * currScale));
                const targetH = Math.max(100, Math.round(metadata.height * currScale));
                pipeline = pipeline.resize(targetW, targetH, { fit: 'inside', withoutEnlargement: true });
            }

            if (ext === 'png') {
                return await pipeline.png({
                    quality: Math.max(20, currQuality),
                    compressionLevel: 9,
                    palette: true
                }).toBuffer();
            } else if (ext === 'webp') {
                return await pipeline.webp({
                    quality: Math.max(15, currQuality),
                    effort: 4
                }).toBuffer();
            } else {
                // If converting to JPEG, flatten transparent alpha onto white
                if (metadata.hasAlpha) {
                    pipeline = pipeline.flatten({ background: '#ffffff' });
                }
                return await pipeline.jpeg({
                    quality: Math.max(15, currQuality),
                    mozjpeg: true
                }).toBuffer();
            }
        }

        let buffer = await processBuffer(quality, scale);

        // Adaptive refinement: If buffer exceeds target size, iteratively reduce quality or scale
        let attempts = 0;
        while (buffer.length > targetSizeKB * 1024 && attempts < 6) {
            attempts++;
            if (quality > 30) {
                quality -= 15;
            } else {
                scale *= 0.8;
            }
            buffer = await processBuffer(quality, scale);
        }

        const filename = `compressed_${uuidv4().substring(0, 8)}.${ext}`;
        res.setHeader('Content-Type', outMime);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        console.error('Compress API error:', err);
        res.status(500).send('Compression failed: ' + (err.message || 'unknown error'));
    }
});

// 2. Image Resizer
app.post('/api/resize-image', (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).send('Image exceeds 50MB limit.');
            }
            return res.status(400).send('Upload error: ' + err.message);
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No image uploaded');
        const width = parseInt(req.body.width, 10) || 300;
        const height = parseInt(req.body.height, 10) || 300;
        const fit = req.body.fit || 'cover';

        let pipeline = sharp(req.file.buffer, { failOn: 'none' });
        const metadata = await pipeline.metadata();

        pipeline = pipeline.resize(width, height, { fit: fit });

        // Preserve PNG transparency if input was PNG
        if (metadata.format === 'png') {
            const buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
            const filename = `resized_${uuidv4().substring(0, 8)}.png`;
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(buffer);
        }

        if (metadata.hasAlpha) {
            pipeline = pipeline.flatten({ background: '#ffffff' });
        }
        const buffer = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
        const filename = `resized_${uuidv4().substring(0, 8)}.jpg`;
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        console.error('Resize API error:', err);
        res.status(500).send('Resize Failed: ' + (err.message || 'unknown error'));
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

app.post('/api/auth/sync', (req, res) => {
    try {
        const { id, name, email, picture, avatar } = req.body || {};
        const profilePic = picture || avatar || null;
        const cleanName = (name && name !== 'Clerk Member' && name !== 'Guest Member') 
            ? name 
            : (email && email !== 'clerk-user' ? email.split('@')[0] : 'Member');
        const cleanEmail = (email && email !== 'clerk-user') ? email : '';
        const user = {
            id: id || ('user_' + uuidv4().substring(0, 8)),
            name: cleanName,
            email: cleanEmail,
            picture: profilePic,
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
        return res.status(500).json({ success: false, error: 'Sync failed' });
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
