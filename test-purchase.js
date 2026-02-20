// Test Automated Purchase Script
// Run this in browser console on dashboard to trigger test purchase

const testAutomatedPurchase = async () => {
  try {
    // Get auth token from localStorage (if using dashboard auth)
    const token = localStorage.getItem('authToken') || 'test-token';
    
    const response = await fetch('http://localhost:3001/api/purchases/test-purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        websiteName: 'walmart'
      })
    });
    
    const result = await response.json();
    console.log('🤖 Automated Purchase Test Result:', result);
    
    if (result.status === 'success') {
      console.log('✅', result.message);
      console.log('📊 Purchase Details:', result.purchase);
      console.log('🔄 Automation Info:', result.automation);
    } else {
      console.log('❌ Error:', result.message);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

// Run the test
console.log('🚀 Starting automated purchase test...');
testAutomatedPurchase();