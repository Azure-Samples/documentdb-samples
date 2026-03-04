import { testEmbeddings } from "./embed.js";
import { testPlanner } from "./llm-planner.js";
import { testSynth } from "./llm-synth.js";
import { testMongoConnection } from "./mongo.js";

/**
 * Comprehensive authentication test suite for Azure services.
 * Imports and runs the individual test functions from other scripts.
 */

let testsPassed = 0;
let testsFailed = 0;

function logTest(name: string, status: 'PASS' | 'FAIL', details?: string) {
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
  if (status === 'PASS') {
    testsPassed++;
  } else {
    testsFailed++;
  }
}

async function runEmbeddingsTest() {
  console.log('\n📝 Testing Azure OpenAI Embeddings...');
  try {
    await testEmbeddings();
    logTest('Embeddings API', 'PASS');
    return true;
  } catch (error: any) {
    logTest('Embeddings API', 'FAIL', error?.message || String(error));
    return false;
  }
}

async function runPlannerTest() {
  console.log('\n🤖 Testing Azure OpenAI Chat (Planner)...');
  try {
    await testPlanner();
    logTest('Planner LLM', 'PASS', `Model: ${process.env.AZURE_OPENAI_PLANNER_MODEL}`);
    return true;
  } catch (error: any) {
    logTest('Planner LLM', 'FAIL', error?.message || String(error));
    return false;
  }
}

async function runSynthTest() {
  console.log('\n💬 Testing Azure OpenAI Chat (Synthesizer)...');
  try {
    await testSynth();
    logTest('Synthesizer LLM', 'PASS', `Model: ${process.env.AZURE_OPENAI_SYNTH_MODEL}`);
    return true;
  } catch (error: any) {
    logTest('Synthesizer LLM', 'FAIL', error?.message || String(error));
    return false;
  }
}

async function runMongoTest() {
  console.log('\n🗄️  Testing Azure DocumentDB for MongoDB vCore...');
  try {
    await testMongoConnection();
    logTest('MongoDB Connection', 'PASS');
    return true;
  } catch (error: any) {
    logTest('MongoDB Connection', 'FAIL', error?.message || String(error));
    return false;
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔐 Azure Passwordless Authentication Test Suite');
  console.log('═══════════════════════════════════════════════════════');
  
  console.log('\n📋 Configuration:');
  console.log(`   OpenAI Instance: ${process.env.AZURE_OPENAI_ENDPOINT|| 'NOT SET'}`);
  console.log(`   Embedding Model: ${process.env.AZURE_OPENAI_EMBEDDING_MODEL || 'NOT SET'}`);
  console.log(`   Planner Model: ${process.env.AZURE_OPENAI_PLANNER_MODEL || 'NOT SET'}`);
  console.log(`   Synth Model: ${process.env.AZURE_OPENAI_SYNTH_MODEL || 'NOT SET'}`);
  console.log(`   MongoDB Cluster: ${process.env.AZURE_DOCUMENTDB_CLUSTER || 'NOT SET'}`);

  // Run all tests
  await runEmbeddingsTest();
  await runPlannerTest();
  await runSynthTest();
  await runMongoTest();

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 Test Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Total:  ${testsPassed + testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All authentication tests passed! Your environment is ready.');
    console.log('   You can now run: npm run start');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check your Azure configuration.');
    console.log('   - Verify you are logged in: az login');
    console.log('   - Check environment variables in .env');
    console.log('   - Ensure role assignments are configured');
    process.exit(1);
  }
}

// Run the test suite
runAllTests().catch((error) => {
  console.error('\n💥 Test suite failed:', error);
  process.exit(1);
});
