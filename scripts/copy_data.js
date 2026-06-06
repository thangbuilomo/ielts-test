const fs = require('fs');
const path = require('path');

const SRC_VOL9 = 'h:/Codex/VolDesignTest/Mock Test/Vol 9';
const DEST_BASE = 'h:/Codex/VolDesignTest/ielts-test-repo/mock';

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function copyFiles(skill, srcDir, destDirName, fileMap) {
    const jsonDir = path.join(SRC_VOL9, skill, 'Json');
    if (!fs.existsSync(jsonDir)) return;

    const tests = fs.readdirSync(jsonDir);
    tests.forEach(test => {
        if (!test.startsWith('TEST')) return;

        const testSrc = path.join(jsonDir, test);
        const testDest = path.join(DEST_BASE, destDirName, 'data', test.replace('TEST ', 'TEST_'));
        ensureDir(testDest);

        Object.keys(fileMap).forEach(origName => {
            const srcFile = path.join(testSrc, origName);
            const destFile = path.join(testDest, fileMap[origName]);
            if (fs.existsSync(srcFile)) {
                fs.copyFileSync(srcFile, destFile);
            }
        });

        // Copy assets folder if it exists
        const assetsSrc = path.join(testSrc, 'assets');
        const assetsDest = path.join(testDest, 'assets');
        if (fs.existsSync(assetsSrc)) {
            ensureDir(assetsDest);
            const assetsFiles = fs.readdirSync(assetsSrc);
            assetsFiles.forEach(file => {
                fs.copyFileSync(path.join(assetsSrc, file), path.join(assetsDest, file));
            });
        }
    });
}

// Map for Reading
const readingMap = {
    '00_manifest_practice_test.json': 'manifest.json',
    '01_reading_content.public.json': 'content.json',
    '02_reading_questions.public.json': 'questions.json'
};

// Map for Listening
const listeningMap = {
    '00_manifest_practice_test.json': 'manifest.json',
    '03_listening_content.public.json': 'content.json',
    '04_listening_questions.public.json': 'questions.json'
};

ensureDir(path.join(DEST_BASE, 'reading', 'data'));
ensureDir(path.join(DEST_BASE, 'listening', 'data'));

copyFiles('Reading', SRC_VOL9, 'reading', readingMap);
copyFiles('Listening', SRC_VOL9, 'listening', listeningMap);

console.log('Copy completed.');
