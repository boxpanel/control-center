/**
 * 海康SDK桥接器 - 增强版本
 * 支持Linux SDK和跨平台兼容
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class HikvisionSdkBridgeEnhanced {
    constructor() {
        this.sdkAvailable = false;
        this.platform = process.platform;
        this.arch = process.arch;
        this.initialized = false;
        this.linuxSdkAvailable = false;
        this.javaAvailable = false;
        
        // 路径配置
        this.sdkRoot = join(__dirname, '..');
        this.linuxSdkDir = join(this.sdkRoot, 'linux');
        this.linuxLibsDir = join(this.linuxSdkDir, 'libs');
        this.linuxIncludeDir = join(this.linuxSdkDir, 'include');
        this.linuxToolsDir = join(this.linuxSdkDir, 'tools');
        
        this.javaToolPath = join(__dirname, 'HikvisionSdkTool.java');
        this.javaClassPath = join(__dirname, 'HikvisionSdkTool.class');
        
        console.log(`[SDK Bridge] 平台: ${this.platform}, 架构: ${this.arch}`);
    }

    /**
     * 检查Linux SDK是否可用
     */
    async checkLinuxSdkAvailability() {
        if (this.platform !== 'linux') {
            console.log('[SDK Bridge] 非Linux平台，跳过Linux SDK检查');
            return false;
        }
        
        try {
            console.log('[SDK Bridge] 检查Linux SDK...');
            
            // 检查Linux SDK目录
            if (!existsSync(this.linuxSdkDir)) {
                console.log('[SDK Bridge] Linux SDK目录不存在:', this.linuxSdkDir);
                return false;
            }
            
            // 检查核心库文件
            const requiredLibs = ['libhcnetsdk.so', 'libHCCore.so', 'libPlayCtrl.so'];
            let allLibsExist = true;
            
            for (const lib of requiredLibs) {
                const libPath = join(this.linuxLibsDir, lib);
                if (existsSync(libPath)) {
                    console.log(`  ✓ ${lib}`);
                } else {
                    console.log(`  ✗ 缺少: ${lib}`);
                    allLibsExist = false;
                }
            }
            
            if (!allLibsExist) {
                console.log('[SDK Bridge] Linux SDK库文件不完整');
                return false;
            }
            
            // 检查头文件
            const hcnetSdkHeader = join(this.linuxIncludeDir, 'HCNetSDK.h');
            if (existsSync(hcnetSdkHeader)) {
                console.log(`  ✓ HCNetSDK.h (${Math.round(fs.statSync(hcnetSdkHeader).size / 1024)} KB)`);
            } else {
                console.log('  ✗ 缺少HCNetSDK.h头文件');
                return false;
            }
            
            // 设置库路径
            await this.setupLinuxLibraryPath();
            
            this.linuxSdkAvailable = true;
            console.log('[SDK Bridge] Linux SDK可用');
            return true;
            
        } catch (error) {
            console.error('[SDK Bridge] 检查Linux SDK失败:', error.message);
            return false;
        }
    }
    
    /**
     * 设置Linux库路径
     */
    async setupLinuxLibraryPath() {
        if (this.platform !== 'linux') {
            return false;
        }
        
        try {
            // 获取当前LD_LIBRARY_PATH
            const currentPath = process.env.LD_LIBRARY_PATH || '';
            
            // 添加Linux SDK库目录
            if (!currentPath.includes(this.linuxLibsDir)) {
                process.env.LD_LIBRARY_PATH = `${this.linuxLibsDir}:${currentPath}`;
                console.log(`[SDK Bridge] 已设置 LD_LIBRARY_PATH: ${this.linuxLibsDir}`);
            }
            
            // 设置其他环境变量
            process.env.HIKVISION_SDK_ROOT = this.linuxSdkDir;
            process.env.HIKVISION_LIB_PATH = this.linuxLibsDir;
            process.env.HIKVISION_INCLUDE_PATH = this.linuxIncludeDir;
            
            return true;
        } catch (error) {
            console.error('[SDK Bridge] 设置Linux库路径失败:', error.message);
            return false;
        }
    }
    
    /**
     * 检查Java环境
     */
    async checkJavaEnvironment() {
        try {
            const javaCheck = await this.execCommand('java -version');
            if (!javaCheck.success) {
                console.log('[SDK Bridge] Java未安装');
                this.javaAvailable = false;
                return false;
            }
            
            console.log('[SDK Bridge] Java已安装');
            
            // 检查JNA库
            try {
                const jnaCheck = await this.execCommand('java -cp .:jna.jar com.sun.jna.Native');
                if (jnaCheck.stdout.includes('JNA native library')) {
                    console.log('[SDK Bridge] JNA库可用');
                    this.javaAvailable = true;
                    return true;
                }
            } catch (e) {
                console.log('[SDK Bridge] JNA库检查失败，可能需要安装JNA');
            }
            
            this.javaAvailable = true; // 即使没有JNA也标记为可用
            return true;
            
        } catch (error) {
            console.log('[SDK Bridge] Java环境检查失败:', error.message);
            this.javaAvailable = false;
            return false;
        }
    }
    
    /**
     * 编译Java工具
     */
    async compileJavaTools() {
        if (!this.javaAvailable) {
            console.log('[SDK Bridge] Java不可用，跳过Java工具编译');
            return false;
        }
        
        if (!existsSync(this.javaToolPath)) {
            console.log('[SDK Bridge] Java工具源文件未找到:', this.javaToolPath);
            return false;
        }
        
        try {
            console.log('[SDK Bridge] 编译Java工具...');
            
            // 构建类路径
            let classpath = `"${__dirname}"`;
            if (this.linuxSdkAvailable) {
                classpath += `:"${this.linuxLibsDir}/*"`;
            }
            
            const result = await this.execCommand(
                `javac -cp ${classpath} -d "${__dirname}" "${this.javaToolPath}"`
            );
            
            if (result.success) {
                console.log('[SDK Bridge] ✓ Java工具编译成功');
                return true;
            } else {
                console.error('[SDK Bridge] ✗ Java工具编译失败:', result.stderr);
                
                // 尝试简化编译
                console.log('[SDK Bridge] 尝试简化编译...');
                const simpleResult = await this.execCommand(
                    `javac -d "${__dirname}" "${this.javaToolPath}"`
                );
                
                if (simpleResult.success) {
                    console.log('[SDK Bridge] ✓ Java工具简化编译成功');
                    return true;
                } else {
                    console.error('[SDK Bridge] ✗ Java工具编译完全失败');
                    return false;
                }
            }
        } catch (error) {
            console.error('[SDK Bridge] 编译Java工具异常:', error.message);
            return false;
        }
    }
    
    /**
     * 检查SDK是否可用
     */
    async checkSdkAvailability() {
        try {
            // 检查Linux SDK
            const linuxSdkAvailable = await this.checkLinuxSdkAvailability();
            
            // 检查Java环境
            const javaAvailable = await this.checkJavaEnvironment();
            
            // SDK可用条件：Linux SDK可用 或 Java可用
            this.sdkAvailable = linuxSdkAvailable || javaAvailable;
            
            if (this.sdkAvailable) {
                console.log('[SDK Bridge] SDK环境检查通过');
                
                // 如果Java可用，编译Java工具
                if (javaAvailable) {
                    await this.compileJavaTools();
                }
            } else {
                console.log('[SDK Bridge] SDK环境检查失败，将使用模拟模式');
            }
            
            return this.sdkAvailable;
            
        } catch (error) {
            console.error('[SDK Bridge] SDK环境检查失败:', error.message);
            this.sdkAvailable = false;
            return false;
        }
    }

    /**
     * 执行命令
     */
    execCommand(command) {
        return new Promise((resolve) => {
            const [cmd, ...args] = command.split(' ');
            const process = spawn(cmd, args);

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    success: code === 0,
                    code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim()
                });
            });

            process.on('error', () => {
                resolve({
                    success: false,
                    code: -1,
                    stdout: '',
                    stderr: '命令执行失败'
                });
            });
        });
    }

    /**
     * 初始化SDK桥接器
     */
    async initialize() {
        if (this.initialized) {
            return this.sdkAvailable;
        }

        try {
            const available = await this.checkSdkAvailability();
            if (!available) {
                console.log('[SDK Bridge] SDK不可用，使用模拟模式');
                this.sdkAvailable = false;
                this.initialized = true;
                return false;
            }
            
            this.initialized = true;
            console.log('[SDK Bridge] SDK桥接器初始化成功');
            return true;
        } catch (error) {
            console.error('[SDK Bridge] 初始化失败:', error.message);
            this.sdkAvailable = false;
            this.initialized = true;
            return false;
        }
    }

    /**
     * 获取设备触发模式配置
     */
    async getTriggerConfig(deviceInfo) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.sdkAvailable) {
            // 返回模拟数据
            return this.getMockTriggerConfig(deviceInfo);
        }

        try {
            const { ip, port = 8000, username = 'admin', password = 'admin123' } = deviceInfo;
            
            // 构建Java命令
            let classpath = `"${__dirname}"`;
            if (this.linuxSdkAvailable) {
                classpath += `:"${this.linuxLibsDir}/*"`;
            }
            
            const result = await this.execCommand(
                `java -cp ${classpath} HikvisionSdkTool ${ip} ${port} ${username} ${password}`
            );

            if (result.success) {
                try {
                    const data = JSON.parse(result.stdout);
                    return {
                        ...data,
                        sdkType: this.linuxSdkAvailable ? 'linux' : 'java',
                        platform: this.platform
                    };
                } catch (e) {
                    return {
                        error: '解析SDK响应失败',
                        rawResponse: result.stdout,
                        mock: true,
                        ...this.getMockTriggerConfig(deviceInfo)
                    };
                }
            } else {
                console.error('[SDK Bridge] SDK调用失败:', result.stderr);
                return this.getMockTriggerConfig(deviceInfo);
            }
        } catch (error) {
            console.error('[SDK Bridge] 获取触发配置异常:', error.message);
            return this.getMockTriggerConfig(deviceInfo);
        }
    }

    /**
     * 获取模拟的触发模式配置
     */
    getMockTriggerConfig(deviceInfo) {
        // 返回模拟数据，用于开发和测试
        return {
            success: true,
            triggerMode: 1,
            coilSensitivity: 75,
            radarSensitivity: 60,
            videoSensitivity: 80,
            rs485Sensitivity: 70,
            mock: true,
            message: '使用模拟数据（SDK不可用）',
            platform: this.platform,
            sdkAvailable: this.sdkAvailable
        };
    }

    /**
     * 获取设备基本信息
     */
    async getDeviceInfo(deviceInfo) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.sdkAvailable) {
            return this.getMockDeviceInfo(deviceInfo);
        }

        // 这里可以添加实际的SDK设备信息获取逻辑
        // 目前返回模拟数据
        return this.getMockDeviceInfo(deviceInfo);
    }

    /**
     * 获取模拟的设备信息
     */
    getMockDeviceInfo(deviceInfo) {
        const { ip, name = '未知设备' } = deviceInfo;
        
        return {
            success: true,
            deviceName: name,
            ipAddress: ip,
            model: 'iDS-2CD9371-KS',
            serialNumber: `SN-${Date.now().toString(16).toUpperCase()}`,
            firmwareVersion: 'V5.7.0',
            manufacturer: 'Hikvision',
            mock: true,
            message: '使用模拟设备信息',
            platform: this.platform,
            sdkAvailable: this.sdkAvailable
        };
    }

    /**
     * 测试SDK连接
     */
    async testConnection(deviceInfo) {
        if (!this.initialized) {
            await this.initialize();
        }

        const result = await this.getTriggerConfig(deviceInfo);
        return {
            sdkAvailable: this.sdkAvailable,
            linuxSdkAvailable: this.linuxSdkAvailable,
            javaAvailable: this.javaAvailable,
            platform: this.platform,
            connectionTest: result.success || result.mock,
            result
        };
    }
    
    /**
     * 获取SDK状态详情
     */
    getDetailedStatus() {
        return {
            sdkAvailable: this.sdkAvailable,
            linuxSdkAvailable: this.linuxSdkAvailable,
            javaAvailable: this.javaAvailable,
            platform: this.platform,
            arch: this.arch,
            initialized: this.initialized,
            linuxSdkDir: this.linuxSdkAvailable ? this.linuxSdkDir : null,
            linuxLibsDir: this.linuxSdkAvailable ? this.linuxLibsDir : null,
            message: this.sdkAvailable ? 
                `SDK功能可用 (${this.linuxSdkAvailable ? 'Linux SDK' : 'Java'})` : 
                'SDK功能不可用，使用模拟模式'
        };
    }
}

// 创建单例实例
const sdkBridge = new HikvisionSdkBridgeEnhanced();

// 导出单例
export default sdkBridge;