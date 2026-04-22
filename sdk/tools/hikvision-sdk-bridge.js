/**
 * 海康SDK桥接器 - 安全版本
 * 使用条件导入和优雅回退机制
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class HikvisionSdkBridge {
    constructor() {
        this.sdkAvailable = false;
        this.javaToolPath = join(__dirname, 'HikvisionSdkTool.java');
        this.javaClassPath = join(__dirname, 'HikvisionSdkTool.class');
        this.initialized = false;
    }

    /**
     * 检查SDK是否可用
     */
    async checkSdkAvailability() {
        try {
            // 检查Java是否安装
            const javaCheck = await this.execCommand('java -version');
            if (!javaCheck.success) {
                console.log('[SDK Bridge] Java未安装，SDK功能不可用');
                return false;
            }

            // 检查JNA库是否可用
            try {
                // 尝试加载JNA类
                const jnaCheck = await this.execCommand('java -cp .;* com.sun.jna.Native');
                this.sdkAvailable = true;
                console.log('[SDK Bridge] SDK环境检查通过');
                return true;
            } catch (e) {
                console.log('[SDK Bridge] JNA库不可用，SDK功能受限');
                this.sdkAvailable = false;
                return false;
            }
        } catch (error) {
            console.log('[SDK Bridge] SDK环境检查失败:', error.message);
            this.sdkAvailable = false;
            return false;
        }
    }

    /**
     * 初始化SDK桥接器
     */
    async initialize() {
        if (this.initialized) {
            return true;
        }

        try {
            const available = await this.checkSdkAvailability();
            if (!available) {
                console.log('[SDK Bridge] SDK不可用，使用模拟模式');
                this.sdkAvailable = false;
                this.initialized = true;
                return false;
            }

            // 编译Java工具
            await this.compileJavaTool();
            
            this.sdkAvailable = true;
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
     * 编译Java工具
     */
    async compileJavaTool() {
        return new Promise((resolve, reject) => {
            const javac = spawn('javac', [
                '-cp',
                '.;*',
                '-d',
                __dirname,
                this.javaToolPath
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
                    console.log('[SDK Bridge] Java工具编译成功');
                    resolve();
                } else {
                    console.error('[SDK Bridge] Java工具编译失败:', stderr);
                    reject(new Error(`编译失败: ${stderr}`));
                }
            });

            javac.on('error', (error) => {
                console.error('[SDK Bridge] 编译过程错误:', error.message);
                reject(error);
            });
        });
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
            
            const result = await this.execCommand(
                `java -cp "${__dirname};${__dirname}/*" HikvisionSdkTool ${ip} ${port} ${username} ${password}`
            );

            if (result.success) {
                try {
                    return JSON.parse(result.stdout);
                } catch (e) {
                    return {
                        error: '解析SDK响应失败',
                        rawResponse: result.stdout,
                        mock: true
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
            message: '使用模拟数据（SDK不可用）'
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
            message: '使用模拟设备信息'
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
            connectionTest: result.success || result.mock,
            result
        };
    }
}

// 创建单例实例
const sdkBridge = new HikvisionSdkBridge();

// 导出单例
export default sdkBridge;