import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTimeTrend = new Trend('response_time');
const requestCount = new Counter('requests');

// Test configuration
export const options = {
  stages: [
    // Ramp up
    { duration: '2m', target: 20 },   // Ramp up to 20 users over 2 minutes
    { duration: '5m', target: 20 },   // Stay at 20 users for 5 minutes
    { duration: '2m', target: 50 },   // Ramp up to 50 users over 2 minutes
    { duration: '5m', target: 50 },   // Stay at 50 users for 5 minutes
    { duration: '2m', target: 100 },  // Ramp up to 100 users over 2 minutes
    { duration: '5m', target: 100 },  // Stay at 100 users for 5 minutes
    { duration: '5m', target: 0 },    // Ramp down to 0 users over 5 minutes
  ],
  thresholds: {
    // Error rate should be below 1%
    errors: ['rate<0.01'],
    // 95% of requests should be below 500ms
    http_req_duration: ['p(95)<500'],
    // 99% of requests should be below 1000ms
    'http_req_duration{expected_response:true}': ['p(99)<1000'],
    // Response time trend
    response_time: ['p(95)<500'],
  },
};

// Base URL from environment or default
const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

// Test data
const testUsers = [
  { email: 'test1@example.com', password: 'password123' },
  { email: 'test2@example.com', password: 'password123' },
  { email: 'test3@example.com', password: 'password123' },
];

// Helper function to get random test user
function getRandomUser() {
  return testUsers[Math.floor(Math.random() * testUsers.length)];
}

// Authentication helper
function authenticate() {
  const user = getRandomUser();
  const loginResponse = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginResponse.status === 200) {
    const token = loginResponse.json('data.token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }
  
  return null;
}

// Test scenarios
export default function () {
  const testScenario = Math.random();
  
  if (testScenario < 0.3) {
    // 30% - Health check and public endpoints
    testPublicEndpoints();
  } else if (testScenario < 0.6) {
    // 30% - Authentication flow
    testAuthenticationFlow();
  } else if (testScenario < 0.8) {
    // 20% - Server management operations
    testServerManagement();
  } else if (testScenario < 0.9) {
    // 10% - Metrics and monitoring
    testMetricsEndpoints();
  } else {
    // 10% - AI operations
    testAIOperations();
  }
  
  sleep(1); // Think time between requests
}

function testPublicEndpoints() {
  const responses = http.batch([
    ['GET', `${BASE_URL}/health`],
    ['GET', `${BASE_URL}/api`],
    ['GET', `${BASE_URL}/health/detailed`],
  ]);

  responses.forEach((response, index) => {
    const endpointNames = ['/health', '/api', '/health/detailed'];
    
    check(response, {
      [`${endpointNames[index]} status is 200`]: (r) => r.status === 200,
      [`${endpointNames[index]} response time < 200ms`]: (r) => r.timings.duration < 200,
    });

    errorRate.add(response.status !== 200);
    responseTimeTrend.add(response.timings.duration);
    requestCount.add(1);
  });
}

function testAuthenticationFlow() {
  const user = getRandomUser();
  
  // Login
  const loginResponse = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const loginSuccess = check(loginResponse, {
    'login status is 200': (r) => r.status === 200,
    'login response time < 300ms': (r) => r.timings.duration < 300,
    'login returns token': (r) => r.json('data.token') !== undefined,
  });

  errorRate.add(!loginSuccess);
  responseTimeTrend.add(loginResponse.timings.duration);
  requestCount.add(1);

  if (loginSuccess) {
    const token = loginResponse.json('data.token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Test authenticated endpoints
    const profileResponse = http.get(`${BASE_URL}/api/v1/users/profile`, { headers });
    
    check(profileResponse, {
      'profile status is 200': (r) => r.status === 200,
      'profile response time < 200ms': (r) => r.timings.duration < 200,
    });

    errorRate.add(profileResponse.status !== 200);
    responseTimeTrend.add(profileResponse.timings.duration);
    requestCount.add(1);
  }
}

function testServerManagement() {
  const headers = authenticate();
  if (!headers) return;

  // Get servers list
  const serversResponse = http.get(`${BASE_URL}/api/v1/servers`, { headers });
  
  check(serversResponse, {
    'servers list status is 200': (r) => r.status === 200,
    'servers list response time < 500ms': (r) => r.timings.duration < 500,
    'servers list returns data': (r) => r.json('data') !== undefined,
  });

  errorRate.add(serversResponse.status !== 200);
  responseTimeTrend.add(serversResponse.timings.duration);
  requestCount.add(1);

  if (serversResponse.status === 200) {
    const servers = serversResponse.json('data.data') || [];
    
    if (servers.length > 0) {
      // Get random server details
      const randomServer = servers[Math.floor(Math.random() * servers.length)];
      const serverResponse = http.get(`${BASE_URL}/api/v1/servers/${randomServer.id}`, { headers });
      
      check(serverResponse, {
        'server details status is 200': (r) => r.status === 200,
        'server details response time < 300ms': (r) => r.timings.duration < 300,
      });

      errorRate.add(serverResponse.status !== 200);
      responseTimeTrend.add(serverResponse.timings.duration);
      requestCount.add(1);
    }
  }
}

function testMetricsEndpoints() {
  const headers = authenticate();
  if (!headers) return;

  const metricsEndpoints = [
    '/api/v1/metrics/summary',
    '/api/v1/metrics/bridge',
    '/api/v1/system/info',
    '/api/v1/system/stats',
  ];

  const responses = http.batch(
    metricsEndpoints.map(endpoint => ['GET', `${BASE_URL}${endpoint}`, null, { headers }])
  );

  responses.forEach((response, index) => {
    check(response, {
      [`${metricsEndpoints[index]} status is 200`]: (r) => r.status === 200,
      [`${metricsEndpoints[index]} response time < 400ms`]: (r) => r.timings.duration < 400,
    });

    errorRate.add(response.status !== 200);
    responseTimeTrend.add(response.timings.duration);
    requestCount.add(1);
  });
}

function testAIOperations() {
  const headers = authenticate();
  if (!headers) return;

  // Test AI status
  const aiStatusResponse = http.get(`${BASE_URL}/api/v1/ai/status`, { headers });
  
  check(aiStatusResponse, {
    'AI status is 200': (r) => r.status === 200,
    'AI status response time < 300ms': (r) => r.timings.duration < 300,
  });

  errorRate.add(aiStatusResponse.status !== 200);
  responseTimeTrend.add(aiStatusResponse.timings.duration);
  requestCount.add(1);

  // Test AI chat (lightweight request)
  const chatResponse = http.post(`${BASE_URL}/api/v1/ai/chat`, JSON.stringify({
    message: 'Hello, how are the servers doing?'
  }), { headers });
  
  check(chatResponse, {
    'AI chat status is 200': (r) => r.status === 200,
    'AI chat response time < 2000ms': (r) => r.timings.duration < 2000, // AI requests take longer
  });

  errorRate.add(chatResponse.status !== 200);
  responseTimeTrend.add(chatResponse.timings.duration);
  requestCount.add(1);
}

// Setup function - runs once at the beginning
export function setup() {
  console.log('Starting load test...');
  console.log(`Target: ${BASE_URL}`);
  
  // Test if the API is accessible
  const response = http.get(`${BASE_URL}/health`);
  if (response.status !== 200) {
    throw new Error(`API is not accessible. Status: ${response.status}`);
  }
  
  console.log('API is accessible, starting test...');
}

// Teardown function - runs once at the end
export function teardown(data) {
  console.log('Load test completed.');
}

// Handle summary - custom output formatting
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

// Text summary helper (simplified)
function textSummary(data, options = {}) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let output = `${indent}Load Test Results:\n`;
  output += `${indent}==================\n`;
  output += `${indent}Total Requests: ${data.metrics.requests.values.count}\n`;
  output += `${indent}Failed Requests: ${data.metrics.http_req_failed.values.passes}\n`;
  output += `${indent}Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%\n`;
  output += `${indent}Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  output += `${indent}95th Percentile: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  output += `${indent}99th Percentile: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
  
  return output;
}