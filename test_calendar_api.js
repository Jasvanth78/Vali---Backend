const http = require('http');

const options = {
  hostname: 'localhost',
  port: 7005, // Assuming default backend port
  path: '/api/user/calendar',
  method: 'GET',
};

console.log('Running automated test for /api/user/calendar...');

const req = http.request(options, res => {
  let data = '';

  res.on('data', chunk => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(data);
        console.log('Successfully received calendar data.');
        console.log(`Number of dates with events: ${Object.keys(json).length}`);
        console.log('Test Passed!');
      } catch (e) {
        console.error('Failed to parse JSON response.', e);
        console.log('Test Failed!');
      }
    } else {
      console.error(`Failed with status code ${res.statusCode}`);
      console.log('Test Failed!');
    }
  });
});

req.on('error', error => {
  console.error('Error hitting API:', error.message);
  console.log('Is the backend server running on port 5000?');
});

req.end();
