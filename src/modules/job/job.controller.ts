import { Controller, Post, Get, Param, ParseIntPipe } from '@nestjs/common';
import { JobService } from './job.service';

@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  async getAllJobs() {
    return this.jobService.getAllJobs();
  }

  @Get(':id')
  async getJob(@Param('id', ParseIntPipe) id: number) {
    return this.jobService.getJob(id);
  }

  @Post(':id/run')
  async runJob(@Param('id', ParseIntPipe) id: number) {
    return this.jobService.runJob(id);
  }

  @Post(':id/rerun')
  async rerunJob(@Param('id', ParseIntPipe) id: number) {
    return this.jobService.rerunJob(id);
  }

  @Post(':id/pause')
  async pauseJob(@Param('id', ParseIntPipe) id: number) {
    return this.jobService.pauseJob(id);
  }

  @Post(':id/cancel')
  async cancelJob(@Param('id', ParseIntPipe) id: number) {
    return this.jobService.cancelJob(id);
  }
}
