package vn.id.congtc145.coffeepos.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import java.util.concurrent.TimeUnit

/** FIFO push: a rejected operation blocks later operations until manually reconciled. */
class SyncOutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val session = DeviceCredentialStore(applicationContext).load() ?: return Result.failure()
        val database = AppDatabase.getDatabase(applicationContext)
        return when (OutboxSyncRepository(database).sync(session, vn.id.congtc145.coffeepos.BuildConfig.VERSION_NAME) { isStopped }) {
            OutboxSyncResult.SUCCESS -> Result.success()
            OutboxSyncResult.RETRY -> Result.retry()
            OutboxSyncResult.REJECTED -> Result.failure()
            OutboxSyncResult.DEVICE_BLOCKED -> Result.failure()
        }
    }
}

object SyncOutboxScheduler {
    private val onlineConstraint = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncOutboxWorker>(15, TimeUnit.MINUTES)
            .setConstraints(onlineConstraint)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "coffee-pos-outbox-periodic", ExistingPeriodicWorkPolicy.KEEP, request
        )
    }

    fun enqueueNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncOutboxWorker>()
            .setConstraints(onlineConstraint)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "coffee-pos-outbox-now", ExistingWorkPolicy.KEEP, request
        )
    }
}
