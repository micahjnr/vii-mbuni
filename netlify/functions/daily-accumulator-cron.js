// netlify/functions/daily-accumulator-cron.js
// Netlify scheduled function — fires at 08:00 UTC every day.
// Docs: https://docs.netlify.com/functions/scheduled-functions/
//
// netlify.toml config required:
//   [[plugins]]
//   package = "@netlify/plugin-scheduled-functions"
//
//   [functions."daily-accumulator-cron"]
//   schedule = "0 8 * * *"

const { generateDailyAccumulator } = require('./accumulator-service')

exports.handler = async () => {
  console.log('[Cron] Daily accumulator job triggered at', new Date().toISOString())

  try {
    const result = await generateDailyAccumulator()

    if (result.skipped) {
      console.log(`[Cron] Already generated for today — id: ${result.id}`)
    } else {
      console.log(`[Cron] ✅ New accumulator — id: ${result.id}, odds: ${result.total_odds}, confidence: ${result.confidence}`)
    }

    return { statusCode: 200 }
  } catch (err) {
    console.error('[Cron] ❌ Accumulator generation failed:', err.message)
    // Don't throw — Netlify will retry failed scheduled functions
    return { statusCode: 500 }
  }
}
