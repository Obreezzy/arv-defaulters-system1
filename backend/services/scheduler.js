// backend/services/scheduler.js
// Main scheduler for automated tasks

const cron = require('node-cron');
const detectDefaultersJob = require('../jobs/detectDefaulters');
const sendRemindersJob = require('../jobs/sendReminders');

const scheduledTasks = [];

const startScheduler = () => {
    console.log('\n========================================');
    console.log('SCHEDULER STARTING');
    console.log('========================================\n');

    // JOB 1: Detect defaulters - Daily at 7:00 AM
    const defaulterDetectionTask = cron.schedule('0 7 * * *', async () => {
        await detectDefaultersJob();
    }, {
        scheduled: true,
        timezone: "Africa/Harare"
    });

    scheduledTasks.push({
        name: 'Defaulter Detection',
        schedule: 'Daily at 7:00 AM',
        task: defaulterDetectionTask
    });
    console.log('✅ Scheduled: Defaulter Detection - Daily at 7:00 AM (Harare)');

    // JOB 2: Send 3-day reminders - Daily at 8:00 AM
    const reminder3DaysTask = cron.schedule('0 8 * * *', async () => {
        await sendRemindersJob(3);
    }, {
        scheduled: true,
        timezone: "Africa/Harare"
    });

    scheduledTasks.push({
        name: '3-Day Reminders',
        schedule: 'Daily at 8:00 AM',
        task: reminder3DaysTask
    });
    console.log('✅ Scheduled: 3-Day Reminders - Daily at 8:00 AM (Harare)');

    // JOB 3: Send 1-day reminders - Daily at 9:00 AM
    const reminder1DayTask = cron.schedule('0 9 * * *', async () => {
        await sendRemindersJob(1);
    }, {
        scheduled: true,
        timezone: "Africa/Harare"
    });

    scheduledTasks.push({
        name: '1-Day Reminders',
        schedule: 'Daily at 9:00 AM',
        task: reminder1DayTask
    });
    console.log('✅ Scheduled: 1-Day Reminders - Daily at 9:00 AM (Harare)');

    // JOB 4: Weekly summary - Every Monday at 10:00 AM
    const weeklySummaryTask = cron.schedule('0 10 * * 1', async () => {
        console.log('\n========================================');
        console.log('AUTOMATED JOB: Weekly Summary');
        console.log('Started:', new Date().toISOString());
        console.log('========================================\n');
        console.log('Weekly summary job (placeholder - implement with reports)');
        console.log('\n========================================');
        console.log('Job completed');
        console.log('========================================\n');
    }, {
        scheduled: true,
        timezone: "Africa/Harare"
    });

    scheduledTasks.push({
        name: 'Weekly Summary',
        schedule: 'Every Monday at 10:00 AM',
        task: weeklySummaryTask
    });
    console.log('✅ Scheduled: Weekly Summary - Every Monday at 10:00 AM (Harare)');

    console.log('\n========================================');
    console.log('SCHEDULER STARTED SUCCESSFULLY');
    console.log(`Total scheduled jobs: ${scheduledTasks.length}`);
    console.log('========================================\n');
};

const stopScheduler = () => {
    console.log('\nStopping scheduler...');
    scheduledTasks.forEach(task => {
        task.task.stop();
        console.log(`Stopped: ${task.name}`);
    });
    console.log('Scheduler stopped\n');
};

const getScheduledJobs = () => {
    return scheduledTasks.map(task => ({
        name: task.name,
        schedule: task.schedule,
        running: task.task.getStatus() === 'scheduled'
    }));
};

const triggerDefaulterDetection = async () => {
    console.log('Manually triggering defaulter detection...');
    return await detectDefaultersJob();
};

const triggerReminders = async (days) => {
    console.log(`Manually triggering ${days}-day reminders...`);
    return await sendRemindersJob(days);
};

module.exports = {
    startScheduler,
    stopScheduler,
    getScheduledJobs,
    triggerDefaulterDetection,
    triggerReminders
};