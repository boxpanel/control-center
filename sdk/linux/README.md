# 海康Linux SDK集成

## 概述

此目录包含了海康威视HCNetSDK的Linux版本文件，已集成到Control Center平台中，支持通过SDK获取设备参数和配置信息。

## 文件结构

```
sdk/linux/
├── libs/                    # Linux共享库文件 (*.so)
│   ├── libhcnetsdk.so      # 主要的HCNetSDK库
│   ├── libHCCore.so        # 核心功能库
│   ├── libPlayCtrl.so      # 播放控制库
│   ├── libcrypto.so.3      # OpenSSL加密库
│   ├── libssl.so.3         # OpenSSL SSL库
│   ├── libz.so             # 压缩库
│   └── ...                 # 其他功能模块库
├── include/                # C/C++头文件
│   ├── HCNetSDK.h         # 主要的SDK头文件 (2.7MB)
│   ├── DataType.h         # 数据类型定义
│   ├── DecodeCardSdk.h    # 解码卡SDK头文件
│   └── plaympeg4.h        # MPEG4播放头文件
└── tools/                 # 工具脚本
    ├── setup-linux-sdk.sh # Linux SDK设置脚本
    └── linux-sdk-loader.js # Node.js SDK加载器
```

## 核心库文件说明

### 必要库文件
1. **libhcnetsdk.so** - 主要的HCNetSDK功能库
2. **libHCCore.so** - 核心功能支持库
3. **libPlayCtrl.so** - 视频播放控制库

### 加密库
1. **libcrypto.so.3** - OpenSSL加密算法库
2. **libssl.so.3** - OpenSSL SSL/TLS库

### 功能模块库 (HCNetSDKCom/)
- libHCAlarm.so - 报警功能
- libHCPreview.so - 视频预览功能
- libHCPlayBack.so - 视频回放功能
- libHCVoiceTalk.so - 语音对讲功能
- libHCDisplay.so - 显示功能
- ...等16个功能模块

## 系统要求

### 操作系统
- Linux (x86_64架构)
- 推荐: Ubuntu 18.04+, CentOS 7+, Debian 10+

### 运行时依赖
- glibc 2.17+
- OpenSSL 1.1.0+
- 标准C/C++运行时库

### Java环境 (可选，用于Java SDK工具)
- JDK 8+
- JNA (Java Native Access) 库

## 使用方法

### 1. 自动设置 (推荐)
```bash
# 进入sdk/linux/tools目录
cd sdk/linux/tools

# 运行设置脚本
chmod +x setup-linux-sdk.sh
./setup-linux-sdk.sh

# 加载环境变量
source ../sdk-env.sh
```

### 2. 手动设置
```bash
# 设置库路径
export LD_LIBRARY_PATH=/path/to/ControlCenter-web/sdk/linux/libs:$LD_LIBRARY_PATH

# 设置环境变量
export HIKVISION_SDK_ROOT=/path/to/ControlCenter-web/sdk/linux
export HIKVISION_LIB_PATH=$HIKVISION_SDK_ROOT/libs
export HIKVISION_INCLUDE_PATH=$HIKVISION_SDK_ROOT/include
```

### 3. 在Node.js中使用
```javascript
// SDK桥接器会自动检测和使用Linux SDK
const sdkBridge = require('./sdk/tools/hikvision-sdk-bridge-enhanced.js');

// 初始化SDK
await sdkBridge.initialize();

// 获取设备信息
const deviceInfo = await sdkBridge.getDeviceInfo({
  ip: '192.168.1.64',
  username: 'admin',
  password: 'admin123'
});
```

## API接口

### REST API (通过Control Center服务器)
```
GET    /api/sdk/status/detailed    # 获取详细的SDK状态
POST   /api/sdk/trigger-config     # 获取设备触发模式配置
POST   /api/sdk/device-info        # 获取设备基本信息
POST   /api/sdk/test-connection    # 测试SDK连接
```

### Java工具API
```bash
# 编译Java工具
javac -cp "sdk/linux/tools:sdk/linux/libs/*" -d sdk/linux/tools sdk/linux/tools/HikvisionSdkTool.java

# 运行Java工具
java -cp "sdk/linux/tools:sdk/linux/libs/*" HikvisionSdkTool <IP> <端口> <用户名> <密码>
```

## 故障排除

### 常见问题

1. **库加载失败**
   ```
   error while loading shared libraries: libhcnetsdk.so: cannot open shared object file
   ```
   **解决方案**: 确保LD_LIBRARY_PATH包含SDK库目录

2. **依赖库缺失**
   ```
   libcrypto.so.3: version `OPENSSL_3.0.0' not found
   ```
   **解决方案**: 安装兼容的OpenSSL版本或使用提供的库文件

3. **权限问题**
   ```
   Permission denied
   ```
   **解决方案**: 确保库文件有执行权限 `chmod +x sdk/linux/libs/*.so`

### 调试步骤

1. 检查库依赖:
   ```bash
   ldd sdk/linux/libs/libhcnetsdk.so
   ```

2. 检查环境变量:
   ```bash
   echo $LD_LIBRARY_PATH
   ```

3. 测试库加载:
   ```bash
   LD_DEBUG=libs ./your_application
   ```

## 开发说明

### 头文件使用
```c
#include "HCNetSDK.h"

// 初始化SDK
NET_DVR_Init();

// 登录设备
NET_DVR_Login_V30(...);

// 获取设备配置
NET_DVR_GetDVRConfig(...);
```

### 平台兼容性
- 当前SDK为x86_64架构编译
- 如需其他架构，需从海康官方获取对应版本
- 支持Linux内核3.10+

## 许可证

海康SDK库文件遵循海康威视的许可证条款。请参考原始SDK包中的许可证文件。

## 支持与反馈

如有问题，请检查：
1. 系统是否为Linux x86_64架构
2. 是否设置了正确的库路径
3. 是否有足够的权限访问库文件
4. 是否满足运行时依赖要求

如需进一步帮助，请提供：
- 操作系统版本 `cat /etc/os-release`
- 系统架构 `uname -m`
- glibc版本 `ldd --version`
- 错误日志和调试信息