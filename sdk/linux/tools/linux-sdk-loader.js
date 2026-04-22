/**
 * Linux SDK加载器
 * 用于在Linux环境下加载和初始化海康SDK
 */

const { spawn, execSync } = require('child_process');
const { join, dirname } = require('path');
const fs = require('fs');

class LinuxSdkLoader {
    constructor() {
        this.sdkRoot = join(__dirname, '..');
        this.libsDir = join(this.sdkRoot, 'libs');
        this.includeDir = join(this.sdkRoot, 'include');
        this.toolsDir = join(this.sdkRoot, 'tools');
        
        this.sdkAvailable = false;
        this.libraryPathSet = false;
        this.javaAvailable = false;
        
        this.requiredLibraries = [
            'libhcnetsdk.so',
            'libHCCore.so',
            'libPlayCtrl.so'
        ];
        
        this.optionalLibraries = [
            'libcrypto.so.3',
            'libssl.so.3',
            'libz.so'
        ];
    }
    
    /**
     * 检查Linux环境
     */
    checkLinuxEnvironment() {
        try {
            // 检查操作系统
            const platform = process.platform;
            if (platform !== 'linux') {
                console.log(`[Linux SDK] 当前操作系统: ${platform}, 需要Linux系统`);
                return false;
            }
            
            // 检查架构
            const arch = process.arch;
            console.log(`[Linux SDK] 系统架构: ${arch}`);
            
            // 检查glibc版本
            try {
                const lddVersion = execSync('ldd --version', { encoding: 'utf8' });
                console.log(`[Linux SDK] glibc版本: ${lddVersion.split('\n')[0]}`);
            } catch (e) {
                console.log('[Linux SDK] 无法获取glibc版本');
            }
            
            return true;
        } catch (error) {
            console.error('[Linux SDK] 检查Linux环境失败:', error.message);
            return false;
        }
    }
    
    /**
     * 检查SDK库文件
     */
    checkSdkLibraries() {
        console.log('[Linux SDK] 检查SDK库文件...');
        
        const missingLibraries = [];
        
        // 检查必要库
        for (const lib of this.requiredLibraries) {
            const libPath = join(this.libsDir, lib);
            if (fs.existsSync(libPath)) {
                console.log(`  ✓ ${lib}`);
                
                // 检查文件权限
                try {
                    fs.accessSync(libPath, fs.constants.R_OK);
                } catch (e) {
                    console.log(`  ⚠ ${lib} 不可读，请检查文件权限`);
                    missingLibraries.push(lib);
                }
            } else {
                console.log(`  ✗ 缺少: ${lib}`);
                missingLibraries.push(lib);
            }
        }
        
        // 检查可选库
        for (const lib of this.optionalLibraries) {
            const libPath = join(this.libsDir, lib);
            if (fs.existsSync(libPath)) {
                console.log(`  ✓ ${lib} (可选)`);
            } else {
                console.log(`  ⚠ ${lib} 未找到 (可选)`);
            }
        }
        
        if (missingLibraries.length > 0) {
            console.log(`[Linux SDK] 缺少必要库文件: ${missingLibraries.join(', ')}`);
            return false;
        }
        
        console.log('[Linux SDK] 所有必要库文件检查通过');
        return true;
    }
    
    /**
     * 设置库路径
     */
    setLibraryPath() {
        if (this.libraryPathSet) {
            return true;
        }
        
        try {
            // 获取当前LD_LIBRARY_PATH
            const currentPath = process.env.LD_LIBRARY_PATH || '';
            
            // 添加SDK库目录
            if (!currentPath.includes(this.libsDir)) {
                process.env.LD_LIBRARY_PATH = `${this.libsDir}:${currentPath}`;
                console.log(`[Linux SDK] 已设置 LD_LIBRARY_PATH: ${this.libsDir}`);
            } else {
                console.log('[Linux SDK] SDK库目录已在 LD_LIBRARY_PATH 中');
            }
            
            // 设置其他环境变量
            process.env.HIKVISION_SDK_ROOT = this.sdkRoot;
            process.env.HIKVISION_LIB_PATH = this.libsDir;
            process.env.HIKVISION_INCLUDE_PATH = this.includeDir;
            
            this.libraryPathSet = true;
            return true;
        } catch (error) {
            console.error('[Linux SDK] 设置库路径失败:', error.message);
            return false;
        }
    }
    
    /**
     * 测试库加载
     */
    testLibraryLoading() {
        return new Promise((resolve) => {
            try {
                // 使用ldd检查库依赖
                const libPath = join(this.libsDir, 'libhcnetsdk.so');
                const lddOutput = execSync(`ldd "${libPath}"`, { encoding: 'utf8' });
                
                console.log('[Linux SDK] 库依赖检查:');
                const lines = lddOutput.split('\n').slice(0, 10); // 只显示前10行
                lines.forEach(line => {
                    if (line.trim()) {
                        console.log(`  ${line}`);
                    }
                });
                
                // 检查是否有未找到的依赖
                if (lddOutput.includes('not found')) {
                    console.log('[Linux SDK] 警告: 有未找到的库依赖');
                    resolve(false);
                } else {
                    console.log('[Linux SDK] 库依赖检查通过');
                    resolve(true);
                }
            } catch (error) {
                console.error('[Linux SDK] 库加载测试失败:', error.message);
                resolve(false);
            }
        });
    }
    
    /**
     * 检查Java环境
     */
    checkJavaEnvironment() {
        return new Promise((resolve) => {
            try {
                // 检查Java是否安装
                const javaVersion = execSync('java -version 2>&1', { encoding: 'utf8' });
                console.log('[Linux SDK] Java环境:');
                console.log(`  ${javaVersion.split('\n')[0]}`);
                
                // 检查JNA
                try {
                    const jnaCheck = execSync('java -cp .:jna.jar com.sun.jna.Native 2>&1', { encoding: 'utf8' });
                    if (jnaCheck.includes('JNA native library')) {
                        console.log('  ✓ JNA库可用');
                        this.javaAvailable = true;
                    } else {
                        console.log('  ⚠ JNA库可能未安装');
                    }
                } catch (e) {
                    console.log('  ⚠ JNA检查失败，可能需要安装JNA库');
                }
                
                resolve(true);
            } catch (error) {
                console.log('[Linux SDK] Java未安装或不可用');
                this.javaAvailable = false;
                resolve(false);
            }
        });
    }
    
    /**
     * 编译Java工具
     */
    compileJavaTools() {
        return new Promise((resolve) => {
            const javaSource = join(this.toolsDir, 'HikvisionSdkTool.java');
            
            if (!fs.existsSync(javaSource)) {
                console.log('[Linux SDK] Java工具源文件未找到');
                resolve(false);
                return;
            }
            
            console.log('[Linux SDK] 编译Java工具...');
            
            const javac = spawn('javac', [
                '-cp',
                `${this.toolsDir}:${this.libsDir}/*`,
                '-d',
                this.toolsDir,
                javaSource
            ]);
            
            let stdout = '';
            let stderr = '';
            
            javac.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            javac.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            javac.on('close', (code) => {
                if (code === 0) {
                    console.log('[Linux SDK] ✓ Java工具编译成功');
                    resolve(true);
                } else {
                    console.error('[Linux SDK] ✗ Java工具编译失败:', stderr);
                    
                    // 尝试简化编译
                    console.log('[Linux SDK] 尝试简化编译...');
                    try {
                        execSync(`javac -d "${this.toolsDir}" "${javaSource}"`, { stdio: 'pipe' });
                        console.log('[Linux SDK] ✓ Java工具简化编译成功');
                        resolve(true);
                    } catch (e) {
                        console.error('[Linux SDK] ✗ Java工具编译完全失败');
                        resolve(false);
                    }
                }
            });
            
            javac.on('error', (error) => {
                console.error('[Linux SDK] 编译过程错误:', error.message);
                resolve(false);
            });
        });
    }
    
    /**
     * 初始化Linux SDK
     */
    async initialize() {
        console.log('[Linux SDK] 开始初始化Linux SDK...');
        
        // 检查Linux环境
        if (!this.checkLinuxEnvironment()) {
            console.log('[Linux SDK] Linux环境检查失败');
            return false;
        }
        
        // 检查SDK库文件
        if (!this.checkSdkLibraries()) {
            console.log('[Linux SDK] SDK库文件检查失败');
            return false;
        }
        
        // 设置库路径
        if (!this.setLibraryPath()) {
            console.log('[Linux SDK] 设置库路径失败');
            return false;
        }
        
        // 测试库加载
        const libraryTest = await this.testLibraryLoading();
        if (!libraryTest) {
            console.log('[Linux SDK] 库加载测试失败');
            // 继续执行，因为可能只是缺少可选依赖
        }
        
        // 检查Java环境
        await this.checkJavaEnvironment();
        
        // 如果Java可用，编译Java工具
        if (this.javaAvailable) {
            await this.compileJavaTools();
        } else {
            console.log('[Linux SDK] Java环境不可用，跳过Java工具编译');
        }
        
        this.sdkAvailable = true;
        console.log('[Linux SDK] ✓ Linux SDK初始化完成');
        
        return true;
    }
    
    /**
     * 获取SDK状态
     */
    getStatus() {
        return {
            sdkAvailable: this.sdkAvailable,
            libraryPathSet: this.libraryPathSet,
            javaAvailable: this.javaAvailable,
            sdkRoot: this.sdkRoot,
            libsDir: this.libsDir,
            includeDir: this.includeDir,
            platform: process.platform,
            arch: process.arch
        };
    }
    
    /**
     * 执行SDK命令
     */
    executeSdkCommand(command, args = []) {
        return new Promise((resolve) => {
            try {
                // 确保库路径已设置
                this.setLibraryPath();
                
                const fullCommand = [command, ...args].join(' ');
                console.log(`[Linux SDK] 执行命令: ${fullCommand}`);
                
                const output = execSync(fullCommand, {
                    encoding: 'utf8',
                    env: process.env,
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                
                resolve({
                    success: true,
                    output: output.trim()
                });
            } catch (error) {
                resolve({
                    success: false,
                    error: error.message,
                    output: error.stdout ? error.stdout.toString() : '',
                    stderr: error.stderr ? error.stderr.toString() : ''
                });
            }
        });
    }
}

// 创建单例实例
const linuxSdkLoader = new LinuxSdkLoader();

// 导出单例
module.exports = linuxSdkLoader;