/**
 * 海康SDK桥接器 - 安全版本
 * 使用条件导入和优雅回退机制
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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
            const javaCheck = await this.execCommand('java -version');
            if (!javaCheck.success) {
                console.log('[SDK Bridge] Java未安装，SDK功能不可用');
                return false;
            }

            try {
                const jnaJarPath = join(__dirname, 'jna.jar');
                if (existsSync(jnaJarPath)) {
                    const jnaCheck = await this.execCommand(`java -cp "${jnaJarPath}" com.sun.jna.Native`);
                    if (jnaCheck.success || jnaCheck.stdout.includes('JNA native library')) {
                        console.log('[SDK Bridge] JNA库可用');
                        this.sdkAvailable = true;
                        console.log('[SDK Bridge] SDK环境检查通过');
                        return true;
                    }
                } else {
                    console.log('[SDK Bridge] JNA库未安装（jna.jar不存在）');
                }
                this.sdkAvailable = false;
                return false;
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
                console.log('[SDK Bridge] SDK不可用');
                this.sdkAvailable = false;
                this.initialized = true;
                return false;
            }

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
            const process = spawn(command, {
                shell: true,
                stdio: 'pipe'
            });

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
            return {
                success: false,
                error: 'SDK不可用，无法获取真实数据',
                sdkAvailable: false,
                mock: false,
                message: 'SDK初始化失败，请检查SDK环境'
            };
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
                        success: false,
                        error: '解析SDK响应失败',
                        rawResponse: result.stdout,
                        sdkAvailable: true,
                        mock: false
                    };
                }
            } else {
                console.error('[SDK Bridge] SDK调用失败:', result.stderr);
                return {
                    success: false,
                    error: result.stderr || 'SDK调用失败',
                    sdkAvailable: true,
                    mock: false
                };
            }
        } catch (error) {
            console.error('[SDK Bridge] 获取触发配置异常:', error.message);
            return {
                success: false,
                error: `获取触发配置异常: ${error.message}`,
                sdkAvailable: this.sdkAvailable,
                mock: false
            };
        }
    }

    /**
     * 获取设备基本信息
     */
    async getDeviceInfo(deviceInfo) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.sdkAvailable) {
            return {
                success: false,
                error: 'SDK不可用，无法获取真实数据',
                sdkAvailable: false,
                mock: false,
                message: 'SDK初始化失败，请检查SDK环境'
            };
        }

        return {
            success: false,
            error: '设备信息获取功能尚未实现',
            sdkAvailable: true,
            mock: false,
            message: '请使用其他SDK功能'
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
            connectionTest: result.success,
            result
        };
    }
}

const sdkBridge = new HikvisionSdkBridge();

export default sdkBridge;
