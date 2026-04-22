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
            const jnaJarPath = join(__dirname, 'jna.jar');
            if (existsSync(jnaJarPath)) {
                try {
                    const jnaCheck = await this.execCommand(`java -cp "${jnaJarPath}" com.sun.jna.Native`);
                    if (jnaCheck.success || jnaCheck.stdout.includes('JNA native library')) {
                        console.log('[SDK Bridge] JNA库可用');
                        this.javaAvailable = true;
                        return true;
                    }
                } catch (e) {
                    console.log('[SDK Bridge] JNA库检查失败:', e.message);
                }
            } else {
                console.log('[SDK Bridge] JNA库未安装（jna.jar不存在）');
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
            // 添加JNA库
            const jnaJarPath = join(__dirname, 'jna.jar');
            if (existsSync(jnaJarPath)) {
                classpath += `:"${jnaJarPath}"`;
            }
            
            const result = await this.execCommand(
                `javac -encoding utf-8 -cp ${classpath} -d "${__dirname}" "${this.javaToolPath}"`
            );
            
            if (result.success) {
                console.log('[SDK Bridge] ✓ Java工具编译成功');
                return true;
            } else {
                console.error('[SDK Bridge] ✗ Java工具编译失败:', result.stderr);
                
                // 尝试简化编译（带编码参数）
                console.log('[SDK Bridge] 尝试简化编译...');
                const simpleResult = await this.execCommand(
                    `javac -encoding utf-8 -d "${__dirname}" "${this.javaToolPath}"`
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
                console.log('[SDK Bridge] SDK环境检查失败');
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
     * 初始化SDK桥接器
     */
    async initialize() {
        if (this.initialized) {
            return this.sdkAvailable;
        }

        try {
            const available = await this.checkSdkAvailability();
            if (!available) {
                console.log('[SDK Bridge] SDK不可用');
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
            // SDK不可用，直接返回错误
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
            
            // 构建Java命令
            // 在Windows上使用分号作为classpath分隔符，Linux上使用冒号
            const pathSeparator = this.platform === 'win32' ? ';' : ':';
            let classpath = `"${__dirname}"`;
            if (this.linuxSdkAvailable) {
                classpath += `${pathSeparator}"${this.linuxLibsDir}/*"`;
            }
            
            const result = await this.execCommand(
                `java -cp ${classpath} HikvisionSdkTool getTriggerConfig "${ip}" ${port} "${username}" "${password}"`
            );

            if (result.success) {
                try {
                    const data = JSON.parse(result.stdout);
                    return {
                        ...data,
                        sdkType: this.linuxSdkAvailable ? 'linux' : 'java',
                        platform: this.platform,
                        mock: false
                    };
                } catch (e) {
                    return {
                        success: false,
                        error: `解析SDK响应失败: ${e.message}`,
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
     * 获取设备增强版触发模式配置
     */
    async getEnhancedTriggerConfig(deviceInfo) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.sdkAvailable) {
            // SDK不可用，直接返回错误
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
            
            // 构建Java命令
            // 在Windows上使用分号作为classpath分隔符，Linux上使用冒号
            const pathSeparator = this.platform === 'win32' ? ';' : ':';
            let classpath = `"${__dirname}"`;
            if (this.linuxSdkAvailable) {
                classpath += `${pathSeparator}"${this.linuxLibsDir}/*"`;
            }
            
            const result = await this.execCommand(
                `java -cp ${classpath} HikvisionSdkTool getEnhancedTriggerConfig "${ip}" ${port} "${username}" "${password}"`
            );

            if (result.success) {
                try {
                    const data = JSON.parse(result.stdout);
                    return {
                        ...data,
                        sdkType: this.linuxSdkAvailable ? 'linux' : 'java',
                        platform: this.platform,
                        mock: false
                    };
                } catch (e) {
                    return {
                        success: false,
                        error: `解析SDK响应失败: ${e.message}`,
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
            console.error('[SDK Bridge] 获取增强版触发配置异常:', error.message);
            return {
                success: false,
                error: `获取增强版触发配置异常: ${error.message}`,
                sdkAvailable: this.sdkAvailable,
                mock: false
            };
        }
    }
    
    /**
     * 获取设备FTP配置
     */
    async getFtpConfig(deviceInfo) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.sdkAvailable) {
            // SDK不可用，直接返回错误
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
            
            // 检查Java工具是否可用
            if (!this.javaAvailable) {
                console.log('[SDK Bridge] Java工具不可用，尝试编译...');
                await this.compileJavaTools();
            }
            
            // 构建Java命令
            // 在Windows上使用分号作为classpath分隔符，Linux上使用冒号
            const pathSeparator = this.platform === 'win32' ? ';' : ':';
            let classpath = `"${__dirname}"`;
            if (this.linuxSdkAvailable) {
                classpath += `${pathSeparator}"${this.linuxLibsDir}/*"`;
            }
            
            const result = await this.execCommand(
                `java -cp ${classpath} HikvisionSdkTool getFtpConfig "${ip}" ${port} "${username}" "${password}"`
            );

            if (result.success) {
                try {
                    const data = JSON.parse(result.stdout);
                    return {
                        ...data,
                        sdkAvailable: true,
                        mock: false,
                        sdkType: this.linuxSdkAvailable ? 'linux' : 'java',
                        platform: this.platform
                    };
                } catch (parseError) {
                    console.error('[SDK Bridge] 解析Java工具输出失败:', parseError.message);
                    return {
                        success: false,
                        error: `解析输出失败: ${parseError.message}`,
                        sdkAvailable: true,
                        mock: false
                    };
                }
            } else {
                console.error('[SDK Bridge] Java工具执行失败:', result.stderr);
                return {
                    success: false,
                    error: result.stderr || 'Java工具执行失败',
                    sdkAvailable: true,
                    mock: false
                };
            }
            
        } catch (error) {
            console.error('[SDK Bridge] 获取FTP配置失败:', error.message);
            return {
                success: false,
                error: error.message,
                sdkAvailable: this.sdkAvailable,
                mock: false
            };
        }
    }
    
    /**
     * 获取设备图片命名规则
     */
    async getPictureNamingRule(deviceInfo) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.sdkAvailable) {
            // SDK不可用，直接返回错误
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
            
            // 检查Java工具是否可用
            if (!this.javaAvailable) {
                console.log('[SDK Bridge] Java工具不可用，尝试编译...');
                await this.compileJavaTools();
            }
            
            // 构建Java命令
            // 在Windows上使用分号作为classpath分隔符，Linux上使用冒号
            const pathSeparator = this.platform === 'win32' ? ';' : ':';
            let classpath = `"${__dirname}"`;
            if (this.linuxSdkAvailable) {
                classpath += `${pathSeparator}"${this.linuxLibsDir}/*"`;
            }
            
            const result = await this.execCommand(
                `java -cp ${classpath} HikvisionSdkTool getPictureNamingRule "${ip}" ${port} "${username}" "${password}"`
            );

            if (result.success) {
                try {
                    const data = JSON.parse(result.stdout);
                    return {
                        ...data,
                        sdkAvailable: true,
                        mock: false,
                        sdkType: this.linuxSdkAvailable ? 'linux' : 'java',
                        platform: this.platform
                    };
                } catch (parseError) {
                    console.error('[SDK Bridge] 解析Java工具输出失败:', parseError.message);
                    return {
                        success: false,
                        error: `解析输出失败: ${parseError.message}`,
                        sdkAvailable: true,
                        mock: false
                    };
                }
            } else {
                console.error('[SDK Bridge] Java工具执行失败:', result.stderr);
                return {
                    success: false,
                    error: result.stderr || 'Java工具执行失败',
                    sdkAvailable: true,
                    mock: false
                };
            }
            
        } catch (error) {
            console.error('[SDK Bridge] 获取命名规则失败:', error.message);
            return {
                success: false,
                error: error.message,
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
            // SDK不可用，直接返回错误
            return {
                success: false,
                error: 'SDK不可用，无法获取真实数据',
                sdkAvailable: false,
                mock: false,
                message: 'SDK初始化失败，请检查SDK环境'
            };
        }

        // 这里可以添加实际的SDK设备信息获取逻辑
        // 目前暂时返回错误，表示功能未实现
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
                'SDK功能不可用'
        };
    }
}

// 创建单例实例
const sdkBridge = new HikvisionSdkBridgeEnhanced();

// 导出单例
export default sdkBridge;