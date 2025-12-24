import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // CPU 사용률 (간단한 방법)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = Math.min(100, (cpuUsage.user + cpuUsage.system) / 10000);

    // 메모리 사용률
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryPercent = ((usedMem / totalMem) * 100).toFixed(2);

    // 디스크 사용률 (df 명령어 사용)
    let diskPercent = '0';
    try {
      const { stdout } = await execAsync("df -h / | awk 'NR==2 {print $5}' | sed 's/%//'");
      diskPercent = stdout.trim();
    } catch (error) {
      console.error('디스크 사용률 측정 실패:', error);
      diskPercent = '0';
    }

    // 라즈베리 파이 온도 (vcgencmd 사용)
    let temp = 'N/A';
    try {
      const { stdout } = await execAsync('vcgencmd measure_temp');
      temp = stdout.replace('temp=', '').replace("'C\n", '').trim();
    } catch (error) {
      console.error('온도 측정 실패:', error);
      // vcgencmd가 없으면 (라즈베리 파이가 아니면) 기본값
      temp = 'N/A';
    }

    return Response.json({
      cpu_percent: parseFloat(cpuPercent.toFixed(2)),
      memory: parseFloat(memoryPercent),
      disk: parseFloat(diskPercent),
      temp: temp,
    });
  } catch (error) {
    console.error('시스템 정보 가져오기 실패:', error);
    return Response.json(
      { error: '시스템 정보를 가져올 수 없습니다' },
      { status: 500 }
    );
  }
}

