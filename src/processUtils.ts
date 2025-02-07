import find from 'find-process';
import cp from 'child_process';
import fs from 'fs';


interface ProcessInfo {
    pid: number;
    name: string;
    cmd: string;
}

export async function findProcess(name: string): Promise<ProcessInfo[]> {
    return find('name', name);
}


export async function findProcessesByName(name: string): Promise<ProcessInfo[]> {
    const processes = await find('name', name);
    return processes.map((p) => ({
        pid: p.pid,
        name: p.name,
        cmd: p.cmd,
    }));
}

export async function killProcess(pid: number): Promise<void> {
    await find('pid', pid).then((processes) => {
        if (processes.length > 0) {
            cp.exec(`kill -9 ${processes[0].pid}`);
        }
    });
}

export function findJavaHome(javaVersion: string): string | null {
   // Try to find java home from JAVA_HOME env var first
   const javaHome = process.env.JAVA_HOME;
   if (javaHome) {
       return javaHome;
   }

   // Otherwise try to find it using java command
   try {
       const javaPath = cp.execSync(`/usr/libexec/java_home -v ${javaVersion}`).toString().trim();
       return javaPath;
   } catch (e) {
       // Fallback to default locations
       const defaultPaths = [
           `/usr/lib/jvm/java-${javaVersion}-openjdk`,
           `/usr/lib/jvm/java-${javaVersion}-openjdk-amd64`,
           `/Library/Java/JavaVirtualMachines/jdk-${javaVersion}.jdk/Contents/Home`
       ];

       for (const path of defaultPaths) {
           if (fs.existsSync(path)) {
               return path;
           }
       }
   }

   return null;
}