import path from "path";
import { spawn } from "node:child_process";
import { Chart, type ChartConfiguration } from "chart.js";
import ffmpegPath from "ffmpeg-static";
import { applyEasing, frameCount, type Easing } from "../charts/animation";

export interface AnimationRenderOptions {
  durationSeconds: number;
  fps: number;
  easing: Easing;
}

async function writeToStdin(stdin: NodeJS.WritableStream, buffer: Buffer): Promise<void> {
  if (stdin.write(buffer)) return;
  await new Promise<void>((resolve) => stdin.once("drain", resolve));
}

/**
 * Renders `totalFrames` progress-scaled Chart.js configs to PNG buffers (sequentially, on
 * the main thread — concurrent skia-canvas rendering across threads is unsafe) and streams
 * them into ffmpeg's stdin as an image2pipe sequence to encode an H.264 MP4.
 */
export async function renderChartAnimationToFile(
  buildFrameConfig: (progress: number) => ChartConfiguration,
  width: number,
  height: number,
  outputPath: string,
  options: AnimationRenderOptions,
): Promise<void> {
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  if (path.extname(resolvedPath).toLowerCase() !== ".mp4") {
    throw new Error(`Animated output must be a .mp4 file, got: ${outputPath}`);
  }
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not resolve a binary for this platform");
  }

  const { Canvas } = await import("skia-canvas");

  const ffmpeg = spawn(ffmpegPath, [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "png",
    "-r", String(options.fps),
    "-i", "-",
    // libx264 requires even width/height; chart auto-sizing can produce odd dimensions.
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(options.fps),
    resolvedPath,
  ]);

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  // Prevent an unhandled 'error' crash if ffmpeg exits mid-stream; the real failure
  // still surfaces below via the non-zero exit code + captured stderr.
  ffmpeg.stdin.on("error", () => {});

  const exitCode = new Promise<number>((resolve, reject) => {
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => resolve(code ?? -1));
  });

  const totalFrames = frameCount(options.durationSeconds, options.fps);
  const logInterval = Math.max(1, Math.round(totalFrames / 10));
  const label = path.basename(resolvedPath);
  console.log(`${label}: rendering ${totalFrames} frames...`);
  for (let i = 0; i < totalFrames; i++) {
    const t = totalFrames === 1 ? 1 : i / (totalFrames - 1);
    const progress = applyEasing(t, options.easing);
    const config = buildFrameConfig(progress);

    const canvas = new Canvas(width, height);
    const chart = new Chart(canvas as any, config);
    const frameBuffer = await canvas.toBuffer("png");
    chart.destroy();

    await writeToStdin(ffmpeg.stdin, frameBuffer);

    if (i === 0 || (i + 1) % logInterval === 0 || i === totalFrames - 1) {
      const percent = Math.round(((i + 1) / totalFrames) * 100);
      console.log(`${label}: rendered frame ${i + 1}/${totalFrames} (${percent}%)`);
    }
  }
  ffmpeg.stdin.end();

  const code = await exitCode;
  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}:\n${stderr}`);
  }
  console.log(`Animation saved to ${resolvedPath}`);
}
