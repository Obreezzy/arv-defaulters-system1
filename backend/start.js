const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

console.log('========================================');
console.log(' ARV DEFAULTERS SYSTEM — ORCHESTRATOR');
console.log('========================================\n');

// 1. Safety Check: Verify the new model file exists
const modelPath = path.join(__dirname, 'ml_api', 'winner_hist_gradient_boosting.joblib');

if (!fs.existsSync(modelPath)) {
    console.error('[ ERROR ] Model file missing!');
    console.error(`[ ERROR ] We looked for it here: ${modelPath}`);
    console.error('[ ERROR ] Please ensure winner_hist_gradient_boosting.joblib is inside the ml_api folder.');
    process.exit(1);
}

console.log('[ OK ] ML Model found successfully.');
console.log('[STARTUP] Booting Python Flask API...');

// 2. Start the Flask API
const flaskProcess = spawn('python', ['app.py'], {
    cwd: path.join(__dirname, 'ml_api'),
    stdio: 'pipe' 
});

// Format Flask's output so it's easy to read in the terminal
flaskProcess.stdout.on('data', data => process.stdout.write(`[ FLASK ] ${data}`));
flaskProcess.stderr.on('data', data => process.stderr.write(`[ FLASK ] ${data}`));

let nodeProcess;

// 3. Ping the /health route until Flask is fully awake
const checkFlaskReady = () => {
    http.get('http://127.0.0.1:5000/health', (res) => {
        if (res.statusCode === 200) {
            console.log('\n[ OK ] Flask API is online and healthy.');
            console.log('[STARTUP] Booting Node.js Backend...\n');
            startNodeServer();
        } else {
            setTimeout(checkFlaskReady, 1000); // Try again in 1 second
        }
    }).on('error', () => {
        // If it throws an error, Flask is still waking up
        setTimeout(checkFlaskReady, 1000); 
    });
};

// Start checking Flask after a brief 2-second head start
setTimeout(checkFlaskReady, 2000);

// 4. Start the Node.js Server
const startNodeServer = () => {
    nodeProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: 'inherit' // Inherit allows Node to print its colors and formatting directly
    });
};

// 5. Clean Shutdown handling (When you press Ctrl + C)
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Stopping all servers gracefully...');
    if (flaskProcess) flaskProcess.kill();
    if (nodeProcess) nodeProcess.kill();
    process.exit();
});