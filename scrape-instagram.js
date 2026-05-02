const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const HANDLE = 'cataconjuanjo';
const ASSETS_DIR = path.join(__dirname, 'assets', 'instagram');

if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    protocol.get(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  const result = {
    handle: HANDLE,
    name: null,
    bio: null,
    category: null,
    followers: null,
    following: null,
    posts: null,
    verified: false,
    profilePicUrl: null,
    postImageUrls: [],
    linkInBio: null,
    location: null
  };

  try {
    console.log('Navegando a Instagram...');
    await page.goto(`https://www.instagram.com/${HANDLE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Meta tags - most reliable
    const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => null);
    const ogTitle = await page.$eval('meta[property="og:title"]', el => el.content).catch(() => null);
    const ogImage = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
    const ogDesc = await page.$eval('meta[property="og:description"]', el => el.content).catch(() => null);

    console.log('og:title:', ogTitle);
    console.log('og:description:', ogDesc);
    console.log('meta description:', metaDesc);

    // Parse name from og:title: "Name (@handle) • Instagram"
    if (ogTitle) {
      const nameMatch = ogTitle.match(/^(.+?)\s*\(@/);
      if (nameMatch) result.name = nameMatch[1].trim();
    }

    // Parse stats from meta description: "X Followers, Y Following, Z Posts - bio"
    const descToParse = metaDesc || ogDesc || '';
    const followersMatch = descToParse.match(/([\d,.]+[KMkm]?)\s*Followers?/i);
    const followingMatch = descToParse.match(/([\d,.]+[KMkm]?)\s*Following/i);
    const postsMatch = descToParse.match(/([\d,.]+[KMkm]?)\s*Posts?/i);
    const bioMatch = descToParse.match(/Posts?\s*[-–]\s*(.+)/i);

    if (followersMatch) result.followers = followersMatch[1];
    if (followingMatch) result.following = followingMatch[1];
    if (postsMatch) result.posts = postsMatch[1];
    if (bioMatch) result.bio = bioMatch[1].trim();

    if (ogImage) result.profilePicUrl = ogImage;

    // Try to get more data from page HTML
    const pageContent = await page.content();

    // Look for verified badge
    result.verified = pageContent.includes('"is_verified":true') || pageContent.includes('isVerified":true');

    // Look for category
    const catMatch = pageContent.match(/"category_name"\s*:\s*"([^"]+)"/);
    if (catMatch) result.category = catMatch[1];

    // Look for link in bio
    const linkMatch = pageContent.match(/"external_url"\s*:\s*"([^"]+)"/);
    if (linkMatch) result.linkInBio = linkMatch[1].replace(/\\/g, '');

    // More thorough bio extraction
    const bioMatch2 = pageContent.match(/"biography"\s*:\s*"([^"]+)"/);
    if (bioMatch2 && !result.bio) result.bio = bioMatch2[1].replace(/\\n/g, '\n').replace(/\\/g, '');

    // Scroll to load posts
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(2000);

    // Extract post image URLs
    const imgUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('article img, main img'));
      return imgs
        .map(img => img.src)
        .filter(src => src && src.includes('instagram') && !src.includes('profile_pic') && src.length > 50)
        .filter(src => src.includes('cdninstagram') || src.includes('fbcdn'))
        .slice(0, 12);
    });

    console.log('Post images found:', imgUrls.length);
    result.postImageUrls = imgUrls;

  } catch (err) {
    console.error('Error durante el scraping:', err.message);
  }

  await browser.close();

  // Download profile picture
  if (result.profilePicUrl) {
    try {
      const dest = path.join(ASSETS_DIR, 'profile.jpg');
      await downloadFile(result.profilePicUrl, dest);
      console.log('Foto de perfil descargada');
      result.profilePicLocal = 'assets/instagram/profile.jpg';
    } catch (e) {
      console.error('Error descargando foto de perfil:', e.message);
    }
  }

  // Download post images
  let downloaded = 0;
  for (let i = 0; i < result.postImageUrls.length; i++) {
    try {
      const dest = path.join(ASSETS_DIR, `post-${i + 1}.jpg`);
      await downloadFile(result.postImageUrls[i], dest);
      downloaded++;
      console.log(`Post ${i + 1} descargado`);
    } catch (e) {
      console.error(`Error descargando post ${i + 1}:`, e.message);
    }
  }

  result.downloadedPostsCount = downloaded;

  // Save result
  fs.writeFileSync(path.join(__dirname, 'instagram-data.json'), JSON.stringify(result, null, 2));
  console.log('\n=== RESULTADO ===');
  console.log(JSON.stringify(result, null, 2));
})();
