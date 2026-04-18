import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common';
import { JobStatus } from '../../../generated/prisma/enums';

@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('form-filler') private readonly queue: Queue,
  ) {}

  async createJob(data: {
    userId: number;
    name: string;
    formUrl: string;
    isMultiPage: boolean;
    entries: number;
  }) {
    return this.prisma.job.create({ data });
  }

  async getAllJobs() {
    return this.prisma.job.findMany({});
  }

  async getJobs(userId: number) {
    return this.prisma.job.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async getJob(jobId: number) {
    return this.prisma.job.findUnique({ where: { id: jobId } });
  }

  async runJob(jobId: number) {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.PENDING, progress: 0 },
    });

    await this.queue.add(
      'submit',
      { jobId, startFrom: 0 },
      {
        jobId: `${jobId}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return job;
  }

  async rerunJob(jobId: number) {
    // rerun from scratch regardless of previous progress
    return this.runJob(jobId);
  }

  async pauseJob(jobId: number) {
    const bullJob = await this.queue.getJob(String(jobId));
    await bullJob?.moveToDelayed(Date.now() + 1000 * 60 * 60 * 24);
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.PAUSED },
    });
  }

  async cancelJob(jobId: number) {
    const bullJob = await this.queue.getJob(String(jobId));
    await bullJob?.remove();
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.CANCELLED },
    });
  }

  async updateStatus(jobId: number, status: JobStatus) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status },
    });
  }

  async updateProgress(jobId: number, progress: number) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { progress },
    });
  }
}
