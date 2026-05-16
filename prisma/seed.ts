import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with 5 mock jobs...');

  // Delete existing data to start fresh (optional, but good for seeds)
  await prisma.jobResult.deleteMany({});
  await prisma.job.deleteMany({});

  const jobId1 = 'cm00000000000000000000001';
  const jobId2 = 'cm00000000000000000000002';
  const jobId3 = 'cm00000000000000000000003';
  const jobId4 = 'cm00000000000000000000004';
  const jobId5 = 'cm00000000000000000000005';

  await prisma.$transaction(async (tx) => {
    // -------------------------------------------------------------------------
    // Job 1: status completed, overallPassed true, all checks passed, confidence 0.91
    // -------------------------------------------------------------------------
    await tx.job.create({
      data: {
        id: jobId1,
        originalFilename: 'car_plate_clear.jpg',
        storedFilename: 'stored_car_plate_clear.jpg',
        storedPath: '/app/uploads/stored_car_plate_clear.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024000,
        status: 'completed',
        attempts: 1,
        imageHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        result: {
          create: {
            checks: [
              { name: 'blurDetection', passed: true, confidence: 0.95, detail: 'Laplacian variance: 150.00 (threshold: 80)' },
              { name: 'brightnessCheck', passed: true, confidence: 0.9, detail: 'Brightness: 120 — acceptable' },
              { name: 'dimensionCheck', passed: true, confidence: 1.0, detail: 'Dimensions OK: 1920x1080' },
              { name: 'screenshotDetection', passed: true, confidence: 1.0, detail: 'No screenshot indicators detected' },
              { name: 'numberPlateOCR', passed: true, confidence: 0.95, detail: 'Valid number plate detected: "AB12CDE"' },
              { name: 'duplicateDetection', passed: true, confidence: 1.0, detail: 'No duplicate found' },
            ],
            overallPassed: true,
            overallConfidence: 0.91,
            isDuplicate: false,
          },
        },
      },
    });

    // -------------------------------------------------------------------------
    // Job 2: status completed, overallPassed false, blur check failed, confidence 0.44
    // -------------------------------------------------------------------------
    await tx.job.create({
      data: {
        id: jobId2,
        originalFilename: 'blurry_image.png',
        storedFilename: 'stored_blurry_image.png',
        storedPath: '/app/uploads/stored_blurry_image.png',
        mimeType: 'image/png',
        fileSize: 2048000,
        status: 'completed',
        attempts: 1,
        imageHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        result: {
          create: {
            checks: [
              { name: 'blurDetection', passed: false, confidence: 0.15, detail: 'Laplacian variance: 31.00 (threshold: 80)' },
              { name: 'brightnessCheck', passed: true, confidence: 0.9, detail: 'Brightness: 120 — acceptable' },
              { name: 'dimensionCheck', passed: true, confidence: 1.0, detail: 'Dimensions OK: 1920x1080' },
              { name: 'screenshotDetection', passed: true, confidence: 1.0, detail: 'No screenshot indicators detected' },
              { name: 'numberPlateOCR', passed: false, confidence: 0.1, detail: 'No text detected in centre crop' },
              { name: 'duplicateDetection', passed: true, confidence: 1.0, detail: 'No duplicate found' },
            ],
            overallPassed: false,
            overallConfidence: 0.44,
            isDuplicate: false,
          },
        },
      },
    });

    // -------------------------------------------------------------------------
    // Job 3: status completed, isDuplicate true, confidence 0.88
    // -------------------------------------------------------------------------
    await tx.job.create({
      data: {
        id: jobId3,
        originalFilename: 'car_plate_clear_copy.jpg',
        storedFilename: 'stored_car_plate_clear_copy.jpg',
        storedPath: '/app/uploads/stored_car_plate_clear_copy.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024000,
        status: 'completed',
        attempts: 1,
        imageHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        result: {
          create: {
            checks: [
              { name: 'blurDetection', passed: true, confidence: 0.95, detail: 'Laplacian variance: 150.00 (threshold: 80)' },
              { name: 'brightnessCheck', passed: true, confidence: 0.9, detail: 'Brightness: 120 — acceptable' },
              { name: 'dimensionCheck', passed: true, confidence: 1.0, detail: 'Dimensions OK: 1920x1080' },
              { name: 'screenshotDetection', passed: true, confidence: 1.0, detail: 'No screenshot indicators detected' },
              { name: 'numberPlateOCR', passed: true, confidence: 0.95, detail: 'Valid number plate detected: "AB12CDE"' },
              { name: 'duplicateDetection', passed: false, confidence: 0.0, detail: `Duplicate of job ${jobId1}` },
            ],
            overallPassed: false,
            overallConfidence: 0.88,
            isDuplicate: true,
            duplicateOfJobId: jobId1,
          },
        },
      },
    });

    // -------------------------------------------------------------------------
    // Job 4: status failed, failureReason "Unreadable image file", no JobResult
    // -------------------------------------------------------------------------
    await tx.job.create({
      data: {
        id: jobId4,
        originalFilename: 'corrupted_file.txt',
        storedFilename: 'stored_corrupted_file.jpg',
        storedPath: '/app/uploads/stored_corrupted_file.jpg',
        mimeType: 'image/jpeg',
        fileSize: 512,
        status: 'failed',
        failureReason: 'Unreadable image file',
        attempts: 1,
      },
    });

    // -------------------------------------------------------------------------
    // Job 5: status pending, no JobResult
    // -------------------------------------------------------------------------
    await tx.job.create({
      data: {
        id: jobId5,
        originalFilename: 'in_queue.webp',
        storedFilename: 'stored_in_queue.webp',
        storedPath: '/app/uploads/stored_in_queue.webp',
        mimeType: 'image/webp',
        fileSize: 345600,
        status: 'pending',
        attempts: 0,
      },
    });
  });

  console.log('Successfully seeded 5 jobs.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
