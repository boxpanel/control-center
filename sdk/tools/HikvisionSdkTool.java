import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.Structure;
import com.sun.jna.ptr.IntByReference;

import java.util.Arrays;
import java.util.List;

/**
 * 海康SDK工具类 - 安全的SDK包装器
 * 使用条件加载和优雅回退机制
 */
public class HikvisionSdkTool {
    
    // SDK库接口定义
    public interface HCNetSDK extends Library {
        HCNetSDK INSTANCE = Native.load("hcnetsdk", HCNetSDK.class);
        
        // 初始化SDK
        boolean NET_DVR_Init();
        
        // 清理SDK
        boolean NET_DVR_Cleanup();
        
        // 登录设备
        int NET_DVR_Login_V30(
            String sDVRIP,
            short wDVRPort,
            String sUserName,
            String sPassword,
            NET_DVR_DEVICEINFO_V30 lpDeviceInfo
        );
        
        // 注销登录
        boolean NET_DVR_Logout_V30(int lUserID);
        
        // 获取设备配置
        boolean NET_DVR_GetDVRConfig(
            int lUserID,
            int dwCommand,
            int lChannel,
            Pointer lpOutBuffer,
            int dwOutBufferSize,
            IntByReference lpBytesReturned
        );
        
        // 设置设备配置
        boolean NET_DVR_SetDVRConfig(
            int lUserID,
            int dwCommand,
            int lChannel,
            Pointer lpInBuffer,
            int dwInBufferSize
        );
        
        // 获取错误码
        int NET_DVR_GetLastError();
    }
    
    // 设备信息结构体
    public static class NET_DVR_DEVICEINFO_V30 extends Structure {
        public byte[] sSerialNumber = new byte[48];      // 序列号
        public byte byAlarmInPortNum;                    // 报警输入个数
        public byte byAlarmOutPortNum;                   // 报警输出个数
        public byte byDiskNum;                           // 硬盘个数
        public byte byDVRType;                           // 设备类型
        public byte byChanNum;                           // 模拟通道个数
        public byte byStartChan;                         // 起始通道号
        public byte byAudioChanNum;                      // 语音通道数
        public byte byIPChanNum;                         // 最大数字通道个数
        public byte[] byReserve = new byte[214];         // 保留
        
        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                "sSerialNumber", "byAlarmInPortNum", "byAlarmOutPortNum",
                "byDiskNum", "byDVRType", "byChanNum", "byStartChan",
                "byAudioChanNum", "byIPChanNum", "byReserve"
            );
        }
    }
    
    // 触发模式配置结构体
    public static class NET_ITC_TRIGGERCFG extends Structure {
        public int dwSize;                               // 结构体大小
        public int dwTriggerMode;                        // 触发模式
        public int dwCoilSensitivity;                    // 线圈灵敏度
        public int dwRadarSensitivity;                   // 雷达灵敏度
        public int dwVideoSensitivity;                   // 视频灵敏度
        public int dwRS485Sensitivity;                   // RS485灵敏度
        public int[] dwReserved = new int[32];           // 保留
        
        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                "dwSize", "dwTriggerMode", "dwCoilSensitivity",
                "dwRadarSensitivity", "dwVideoSensitivity", "dwRS485Sensitivity",
                "dwReserved"
            );
        }
    }
    
    // 增强版触发模式配置结构体 - 包含更多触发参数
    public static class NET_ITC_TRIGGERCFG_ENHANCED extends Structure {
        public int dwSize;                               // 结构体大小
        public int dwTriggerMode;                        // 触发模式：0-关闭，1-线圈，2-雷达，3-视频，4-混合，5-IO
        public int dwCoilSensitivity;                    // 线圈灵敏度：0-100
        public int dwRadarSensitivity;                   // 雷达灵敏度：0-100
        public int dwVideoSensitivity;                   // 视频灵敏度：0-100
        public int dwRS485Sensitivity;                   // RS485灵敏度：0-100
        public int dwMinVehicleWidth;                    // 最小车辆宽度（像素）
        public int dwMinVehicleHeight;                   // 最小车辆高度（像素）
        public int dwMaxVehicleWidth;                    // 最大车辆宽度（像素）
        public int dwMaxVehicleHeight;                   // 最大车辆高度（像素）
        public int dwTriggerDelay;                       // 触发延时（毫秒）
        public int dwDebounceTime;                       // 防抖动时间（毫秒）
        public int dwTriggerDirection;                   // 触发方向：0-正向，1-反向，2-双向
        public int dwMinSpeed;                           // 最小触发速度（km/h）
        public int dwMaxSpeed;                           // 最大触发速度（km/h）
        public int dwOutputDelay;                        // 触发输出延时（毫秒）
        public int dwHoldTime;                           // 触发保持时间（毫秒）
        public int dwMultiTriggerLogic;                  // 多触发逻辑：0-AND，1-OR
        public int dwTriggerPriority;                    // 触发优先级：0-低，1-中，2-高
        public int[] dwReserved = new int[20];           // 保留
        
        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                "dwSize", "dwTriggerMode", "dwCoilSensitivity",
                "dwRadarSensitivity", "dwVideoSensitivity", "dwRS485Sensitivity",
                "dwMinVehicleWidth", "dwMinVehicleHeight", "dwMaxVehicleWidth", "dwMaxVehicleHeight",
                "dwTriggerDelay", "dwDebounceTime", "dwTriggerDirection",
                "dwMinSpeed", "dwMaxSpeed", "dwOutputDelay", "dwHoldTime",
                "dwMultiTriggerLogic", "dwTriggerPriority", "dwReserved"
            );
        }
    }
    
    // FTP配置结构体
    public static class NET_DVR_FTPCFG extends Structure {
        public int dwSize;                               // 结构体大小
        public byte byEnable;                            // FTP使能：0-不启用，1-启用
        public byte[] byReserve1 = new byte[3];          // 保留
        public byte[] sServerIP = new byte[64];          // FTP服务器IP地址
        public short wPort;                              // FTP服务器端口
        public byte[] byReserve2 = new byte[2];          // 保留
        public byte[] sUserName = new byte[64];          // FTP用户名
        public byte[] sPassword = new byte[64];          // FTP密码
        public byte[] sDirectory = new byte[128];        // FTP目录
        public byte byUploadMode;                        // 上传模式：0-主动模式，1-被动模式
        public byte byUploadInterval;                    // 上传间隔（分钟）
        public byte byImageQuality;                      // 图片质量：0-最好，1-较好，2-一般，3-较差
        public byte byImageResolution;                   // 图片分辨率：0-最高，1-较高，2-标准，3-较低
        public byte[] byReserve3 = new byte[64];         // 保留
        
        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                "dwSize", "byEnable", "byReserve1", "sServerIP", "wPort",
                "byReserve2", "sUserName", "sPassword", "sDirectory",
                "byUploadMode", "byUploadInterval", "byImageQuality",
                "byImageResolution", "byReserve3"
            );
        }
    }
    
    // 图片命名规则结构体 - 增强版，包含更多命名元素
    public static class NET_DVR_PICNAMINGRULE extends Structure {
        public int dwSize;                               // 结构体大小
        public byte byEnable;                            // 命名规则使能：0-不启用，1-启用
        public byte[] byReserve1 = new byte[3];          // 保留
        public byte[] sPrefix = new byte[32];            // 文件名前缀
        public byte[] sDateFormat = new byte[32];        // 日期格式
        public byte[] sTimeFormat = new byte[32];        // 时间格式
        public byte byChannelNumber;                     // 是否包含通道号：0-不包含，1-包含
        public byte bySequenceNumber;                    // 是否包含序列号：0-不包含，1-包含
        public byte[] sFileExtension = new byte[16];     // 文件扩展名
        public byte byIncludeCameraName;                 // 是否包含摄像头名称：0-不包含，1-包含
        public byte byIncludePlateNumber;                // 是否包含车牌号码：0-不包含，1-包含
        public byte byIncludeTimestamp;                  // 是否包含时间戳：0-不包含，1-包含
        public byte byIncludeEventType;                  // 是否包含事件类型：0-不包含，1-包含
        public byte[] sCameraNameFormat = new byte[32];  // 摄像头名称格式
        public byte[] sPlateNumberFormat = new byte[32]; // 车牌号码格式
        public byte[] sEventTypeFormat = new byte[32];   // 事件类型格式
        public byte[] byReserve2 = new byte[32];         // 保留
        
        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                "dwSize", "byEnable", "byReserve1", "sPrefix", "sDateFormat",
                "sTimeFormat", "byChannelNumber", "bySequenceNumber",
                "sFileExtension", "byIncludeCameraName", "byIncludePlateNumber",
                "byIncludeTimestamp", "byIncludeEventType", "sCameraNameFormat",
                "sPlateNumberFormat", "sEventTypeFormat", "byReserve2"
            );
        }
    }
    
    private static boolean sdkInitialized = false;
    private static HCNetSDK sdk = null;
    
    /**
     * 安全地初始化SDK
     */
    public static boolean safeInit() {
        try {
            System.loadLibrary("hcnetsdk");
            sdk = HCNetSDK.INSTANCE;
            sdkInitialized = sdk.NET_DVR_Init();
            return sdkInitialized;
        } catch (Throwable e) {
            System.err.println("SDK初始化失败: " + e.getMessage());
            sdkInitialized = false;
            sdk = null;
            return false;
        }
    }
    
    /**
     * 安全地清理SDK
     */
    public static void safeCleanup() {
        if (sdkInitialized && sdk != null) {
            try {
                sdk.NET_DVR_Cleanup();
            } catch (Throwable e) {
                System.err.println("SDK清理失败: " + e.getMessage());
            }
            sdkInitialized = false;
            sdk = null;
        }
    }
    
    /**
     * 获取设备触发模式配置
     */
    public static String getTriggerConfig(String ip, int port, String username, String password) {
        if (!sdkInitialized || sdk == null) {
            return "{\"error\": \"SDK未初始化\"}";
        }
        
        int userId = -1;
        try {
            // 登录设备
            NET_DVR_DEVICEINFO_V30 deviceInfo = new NET_DVR_DEVICEINFO_V30();
            userId = sdk.NET_DVR_Login_V30(ip, (short)port, username, password, deviceInfo);
            
            if (userId < 0) {
                int errorCode = sdk.NET_DVR_GetLastError();
                return String.format("{\"error\": \"设备登录失败\", \"code\": %d}", errorCode);
            }
            
            // 获取触发模式配置
            NET_ITC_TRIGGERCFG triggerCfg = new NET_ITC_TRIGGERCFG();
            triggerCfg.dwSize = triggerCfg.size();
            
            IntByReference bytesReturned = new IntByReference();
            boolean success = sdk.NET_DVR_GetDVRConfig(
                userId,
                0x0000, // 触发模式配置命令码
                0,
                triggerCfg.getPointer(),
                triggerCfg.size(),
                bytesReturned
            );
            
            if (!success) {
                int errorCode = sdk.NET_DVR_GetLastError();
                return String.format("{\"error\": \"获取配置失败\", \"code\": %d}", errorCode);
            }
            
            // 读取结构体数据
            triggerCfg.read();
            
            // 构建JSON响应
            return String.format(
                "{\"success\": true, \"triggerMode\": %d, \"coilSensitivity\": %d, " +
                "\"radarSensitivity\": %d, \"videoSensitivity\": %d, \"rs485Sensitivity\": %d}",
                triggerCfg.dwTriggerMode,
                triggerCfg.dwCoilSensitivity,
                triggerCfg.dwRadarSensitivity,
                triggerCfg.dwVideoSensitivity,
                triggerCfg.dwRS485Sensitivity
            );
            
        } catch (Throwable e) {
            return String.format("{\"error\": \"SDK操作异常\", \"message\": \"%s\"}", e.getMessage());
        } finally {
            // 注销登录
            if (userId >= 0 && sdk != null) {
                sdk.NET_DVR_Logout_V30(userId);
            }
        }
    }
    
    /**
     * 获取设备增强版触发模式配置
     */
    public static String getEnhancedTriggerConfig(String ip, int port, String username, String password) {
        if (!sdkInitialized || sdk == null) {
            return "{\"error\": \"SDK未初始化\"}";
        }
        
        int userId = -1;
        try {
            // 登录设备
            NET_DVR_DEVICEINFO_V30 deviceInfo = new NET_DVR_DEVICEINFO_V30();
            userId = sdk.NET_DVR_Login_V30(ip, (short)port, username, password, deviceInfo);
            
            if (userId < 0) {
                int errorCode = sdk.NET_DVR_GetLastError();
                return String.format("{\"error\": \"设备登录失败\", \"code\": %d}", errorCode);
            }
            
            // 获取增强版触发模式配置
            NET_ITC_TRIGGERCFG_ENHANCED triggerCfg = new NET_ITC_TRIGGERCFG_ENHANCED();
            triggerCfg.dwSize = triggerCfg.size();
            
            IntByReference bytesReturned = new IntByReference();
            boolean success = sdk.NET_DVR_GetDVRConfig(
                userId,
                0x0000, // 触发模式配置命令码
                0,
                triggerCfg.getPointer(),
                triggerCfg.size(),
                bytesReturned
            );
            
            if (!success) {
                int errorCode = sdk.NET_DVR_GetLastError();
                return String.format("{\"error\": \"获取配置失败\", \"code\": %d}", errorCode);
            }
            
            // 读取结构体数据
            triggerCfg.read();
            
            // 构建JSON响应
            return String.format(
                "{\"success\": true, \"sdkAvailable\": true, \"mock\": false, " +
                "\"triggerMode\": %d, \"coilSensitivity\": %d, \"radarSensitivity\": %d, " +
                "\"videoSensitivity\": %d, \"rs485Sensitivity\": %d, " +
                "\"minVehicleWidth\": %d, \"minVehicleHeight\": %d, " +
                "\"maxVehicleWidth\": %d, \"maxVehicleHeight\": %d, " +
                "\"triggerDelay\": %d, \"debounceTime\": %d, \"triggerDirection\": %d, " +
                "\"minSpeed\": %d, \"maxSpeed\": %d, \"outputDelay\": %d, " +
                "\"holdTime\": %d, \"multiTriggerLogic\": %d, \"triggerPriority\": %d}",
                triggerCfg.dwTriggerMode,
                triggerCfg.dwCoilSensitivity,
                triggerCfg.dwRadarSensitivity,
                triggerCfg.dwVideoSensitivity,
                triggerCfg.dwRS485Sensitivity,
                triggerCfg.dwMinVehicleWidth,
                triggerCfg.dwMinVehicleHeight,
                triggerCfg.dwMaxVehicleWidth,
                triggerCfg.dwMaxVehicleHeight,
                triggerCfg.dwTriggerDelay,
                triggerCfg.dwDebounceTime,
                triggerCfg.dwTriggerDirection,
                triggerCfg.dwMinSpeed,
                triggerCfg.dwMaxSpeed,
                triggerCfg.dwOutputDelay,
                triggerCfg.dwHoldTime,
                triggerCfg.dwMultiTriggerLogic,
                triggerCfg.dwTriggerPriority
            );
            
        } catch (Throwable e) {
            return String.format("{\"error\": \"SDK操作异常\", \"message\": \"%s\", \"sdkAvailable\": true, \"mock\": false}", e.getMessage());
        } finally {
            // 注销登录
            if (userId >= 0 && sdk != null) {
                sdk.NET_DVR_Logout_V30(userId);
            }
        }
    }
    
    /**
     * 获取设备FTP配置
     */
    public static String getFtpConfig(String ip, int port, String username, String password) {
        if (!sdkInitialized || sdk == null) {
            return "{\"error\": \"SDK未初始化\", \"sdkAvailable\": false, \"mock\": false}";
        }
        
        int userId = -1;
        try {
            // 登录设备
            NET_DVR_DEVICEINFO_V30 deviceInfo = new NET_DVR_DEVICEINFO_V30();
            userId = sdk.NET_DVR_Login_V30(ip, (short)port, username, password, deviceInfo);
            
            if (userId < 0) {
                int errorCode = sdk.NET_DVR_GetLastError();
                return String.format("{\"error\": \"设备登录失败\", \"code\": %d, \"sdkAvailable\": true, \"mock\": false}", errorCode);
            }
            
            // 获取FTP配置
            NET_DVR_FTPCFG ftpCfg = new NET_DVR_FTPCFG();
            ftpCfg.dwSize = ftpCfg.size();
            
            IntByReference bytesReturned = new IntByReference();
            boolean success = sdk.NET_DVR_GetDVRConfig(
                userId,
                0x0010, // FTP配置命令码：NET_DVR_GET_FTPCFG
                0,
                ftpCfg.getPointer(),
                ftpCfg.size(),
                bytesReturned
            );
            
            if (!success) {
                int errorCode = sdk.NET_DVR_GetLastError();
                return String.format("{\"error\": \"获取FTP配置失败\", \"code\": %d, \"sdkAvailable\": true, \"mock\": false}", errorCode);
            }
            
            // 读取结构体数据
            ftpCfg.read();
            
            // 将字节数组转换为字符串
            String serverIP = new String(ftpCfg.sServerIP).trim();
            String ftpUsername = new String(ftpCfg.sUserName).trim();
            String ftpPassword = new String(ftpCfg.sPassword).trim();
            String directory = new String(ftpCfg.sDirectory).trim();
            
            // 构建JSON响应
            return String.format(
                "{\"success\": true, \"sdkAvailable\": true, \"mock\": false, " +
                "\"ftpEnabled\": %s, \"ftpServer\": \"%s\", \"ftpPort\": %d, " +
                "\"ftpUsername\": \"%s\", \"ftpPassword\": \"%s\", \"ftpDirectory\": \"%s\", " +
                "\"ftpUploadMode\": %d, \"ftpUploadInterval\": %d, " +
                "\"ftpImageQuality\": %d, \"ftpImageResolution\": %d}",
                ftpCfg.byEnable == 1 ? "true" : "false",
                serverIP,
                ftpCfg.wPort,
                ftpUsername,
                ftpPassword,
                directory,
                ftpCfg.byUploadMode,
                ftpCfg.byUploadInterval,
                ftpCfg.byImageQuality,
                ftpCfg.byImageResolution
            );
            
        } catch (Throwable e) {
            return String.format("{\"error\": \"SDK操作异常\", \"message\": \"%s\", \"sdkAvailable\": true, \"mock\": false}", e.getMessage());
        } finally {
            // 注销登录
            if (userId >= 0 && sdk != null) {
                sdk.NET_DVR_Logout_V30(userId);
            }
        }
    }
    
    /**
     * 获取设备图片命名规则
     */
    public static String getPictureNamingRule(String ip, int port, String username, String password) {
        if (!sdkInitialized || sdk == null) {
            return "{\"error\": \"SDK未初始化\", \"sdkAvailable\": false, \"mock\": false}";
        }
        
        int userId = -1;
        try {
            // 登录设备
            NET_DVR_DEVICEINFO_V30 deviceInfo = new NET_DVR_DEVICEINFO_V30();
            userId = sdk.NET_DVR_Login_V30(ip, (short)port, username, password, deviceInfo);
            
            if (userId < 0) {
                int errorCode = sdk.NET_DVR_GetLastError();
                return String.format("{\"error\": \"设备登录失败\", \"code\": %d, \"sdkAvailable\": true, \"mock\": false}", errorCode);
            }
            
            // 获取图片命名规则配置
            NET_DVR_PICNAMINGRULE namingRule = new NET_DVR_PICNAMINGRULE();
            namingRule.dwSize = namingRule.size();
            
            IntByReference bytesReturned = new IntByReference();
            boolean success = sdk.NET_DVR_GetDVRConfig(
                userId,
                0x0011, // 图片命名规则命令码：NET_DVR_GET_PICNAMINGRULE
                0,
                namingRule.getPointer(),
                namingRule.size(),
                bytesReturned
            );
            
            if (!success) {
                int errorCode = sdk.NET_DVR_GetLastError();
                return String.format("{\"error\": \"获取命名规则失败\", \"code\": %d, \"sdkAvailable\": true, \"mock\": false}", errorCode);
            }
            
            // 读取结构体数据
            namingRule.read();
            
            // 将字节数组转换为字符串
            String prefix = new String(namingRule.sPrefix).trim();
            String dateFormat = new String(namingRule.sDateFormat).trim();
            String timeFormat = new String(namingRule.sTimeFormat).trim();
            String fileExtension = new String(namingRule.sFileExtension).trim();
            String cameraNameFormat = new String(namingRule.sCameraNameFormat).trim();
            String plateNumberFormat = new String(namingRule.sPlateNumberFormat).trim();
            String eventTypeFormat = new String(namingRule.sEventTypeFormat).trim();
            
            // 构建命名规则示例
            String example = buildNamingExample(prefix, dateFormat, timeFormat, 
                namingRule.byChannelNumber == 1, namingRule.bySequenceNumber == 1,
                namingRule.byIncludeCameraName == 1, namingRule.byIncludePlateNumber == 1,
                namingRule.byIncludeTimestamp == 1, namingRule.byIncludeEventType == 1,
                cameraNameFormat, plateNumberFormat, eventTypeFormat, fileExtension);
            
            // 构建JSON响应
            return String.format(
                "{\"success\": true, \"sdkAvailable\": true, \"mock\": false, " +
                "\"namingRuleEnabled\": %s, \"prefix\": \"%s\", \"dateFormat\": \"%s\", " +
                "\"timeFormat\": \"%s\", \"includeChannelNumber\": %s, " +
                "\"includeSequenceNumber\": %s, \"includeCameraName\": %s, " +
                "\"includePlateNumber\": %s, \"includeTimestamp\": %s, " +
                "\"includeEventType\": %s, \"cameraNameFormat\": \"%s\", " +
                "\"plateNumberFormat\": \"%s\", \"eventTypeFormat\": \"%s\", " +
                "\"fileExtension\": \"%s\", \"example\": \"%s\"}",
                namingRule.byEnable == 1 ? "true" : "false",
                prefix,
                dateFormat,
                timeFormat,
                namingRule.byChannelNumber == 1 ? "true" : "false",
                namingRule.bySequenceNumber == 1 ? "true" : "false",
                namingRule.byIncludeCameraName == 1 ? "true" : "false",
                namingRule.byIncludePlateNumber == 1 ? "true" : "false",
                namingRule.byIncludeTimestamp == 1 ? "true" : "false",
                namingRule.byIncludeEventType == 1 ? "true" : "false",
                cameraNameFormat,
                plateNumberFormat,
                eventTypeFormat,
                fileExtension,
                example
            );
            
        } catch (Throwable e) {
            return String.format("{\"error\": \"SDK操作异常\", \"message\": \"%s\", \"sdkAvailable\": true, \"mock\": false}", e.getMessage());
        } finally {
            // 注销登录
            if (userId >= 0 && sdk != null) {
                sdk.NET_DVR_Logout_V30(userId);
            }
        }
    }
    
    /**
     * 构建命名规则示例 - 增强版，支持更多命名元素
     */
    private static String buildNamingExample(String prefix, String dateFormat, String timeFormat,
                                           boolean includeChannel, boolean includeSequence,
                                           boolean includeCameraName, boolean includePlateNumber,
                                           boolean includeTimestamp, boolean includeEventType,
                                           String cameraNameFormat, String plateNumberFormat,
                                           String eventTypeFormat, String extension) {
        StringBuilder example = new StringBuilder();
        
        // 添加前缀
        if (!prefix.isEmpty()) {
            example.append(prefix).append("_");
        }
        
        // 添加日期
        if (!dateFormat.isEmpty()) {
            example.append("20240101"); // 示例日期：2024年1月1日
        }
        
        // 添加时间
        if (!timeFormat.isEmpty()) {
            if (example.length() > 0 && !example.toString().endsWith("_")) {
                example.append("_");
            }
            example.append("120000"); // 示例时间：12:00:00
        }
        
        // 添加摄像头名称
        if (includeCameraName && !cameraNameFormat.isEmpty()) {
            if (example.length() > 0 && !example.toString().endsWith("_")) {
                example.append("_");
            }
            example.append(cameraNameFormat.isEmpty() ? "摄像头01" : cameraNameFormat);
        }
        
        // 添加车牌号码
        if (includePlateNumber && !plateNumberFormat.isEmpty()) {
            if (example.length() > 0 && !example.toString().endsWith("_")) {
                example.append("_");
            }
            example.append(plateNumberFormat.isEmpty() ? "京A12345" : plateNumberFormat);
        }
        
        // 添加时间戳（如果未包含日期和时间）
        if (includeTimestamp && dateFormat.isEmpty() && timeFormat.isEmpty()) {
            if (example.length() > 0 && !example.toString().endsWith("_")) {
                example.append("_");
            }
            example.append("1704067200"); // 示例时间戳
        }
        
        // 添加事件类型
        if (includeEventType && !eventTypeFormat.isEmpty()) {
            if (example.length() > 0 && !example.toString().endsWith("_")) {
                example.append("_");
            }
            example.append(eventTypeFormat.isEmpty() ? "车辆检测" : eventTypeFormat);
        }
        
        // 添加通道号
        if (includeChannel) {
            if (example.length() > 0 && !example.toString().endsWith("_")) {
                example.append("_");
            }
            example.append("CH01");
        }
        
        // 添加序列号
        if (includeSequence) {
            if (example.length() > 0 && !example.toString().endsWith("_")) {
                example.append("_");
            }
            example.append("001");
        }
        
        // 添加文件扩展名
        if (!extension.isEmpty()) {
            if (!extension.startsWith(".")) {
                example.append(".");
            }
            example.append(extension);
        } else {
            example.append(".jpg");
        }
        
        return example.toString();
    }
    
    /**
     * 主方法 - 用于测试
     * 注意：日志信息输出到stderr，JSON结果输出到stdout
     * 这样Node.js桥接器可以直接解析stdout获取JSON
     */
    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("用法: java HikvisionSdkTool <命令> [参数...]");
            System.err.println("可用命令:");
            System.err.println("  getTriggerConfig <IP> <端口> <用户名> <密码> - 获取触发配置");
            System.err.println("  getEnhancedTriggerConfig <IP> <端口> <用户名> <密码> - 获取增强版触发配置");
            System.err.println("  getFtpConfig <IP> <端口> <用户名> <密码> - 获取FTP配置");
            System.err.println("  getPictureNamingRule <IP> <端口> <用户名> <密码> - 获取图片命名规则");
            System.err.println("示例: java HikvisionSdkTool getTriggerConfig 192.168.1.64 8000 admin admin123");
            return;
        }
        
        String command = args[0];
        
        System.err.println("正在初始化SDK...");
        if (!safeInit()) {
            System.err.println("SDK初始化失败");
            System.out.println("{\"error\": \"SDK初始化失败\", \"sdkAvailable\": false, \"mock\": false}");
            return;
        }
        
        try {
            String result = "";
            
            if (command.equals("getTriggerConfig")) {
                if (args.length < 5) {
                    System.err.println("错误: getTriggerConfig需要4个参数: <IP> <端口> <用户名> <密码>");
                    System.out.println("{\"error\": \"参数不足\", \"sdkAvailable\": true, \"mock\": false}");
                    return;
                }
                String ip = args[1];
                int port = Integer.parseInt(args[2]);
                String username = args[3];
                String password = args[4];
                System.err.println("正在获取设备触发模式配置...");
                result = getTriggerConfig(ip, port, username, password);
                
            } else if (command.equals("getEnhancedTriggerConfig")) {
                if (args.length < 5) {
                    System.err.println("错误: getEnhancedTriggerConfig需要4个参数: <IP> <端口> <用户名> <密码>");
                    System.out.println("{\"error\": \"参数不足\", \"sdkAvailable\": true, \"mock\": false}");
                    return;
                }
                String ip = args[1];
                int port = Integer.parseInt(args[2]);
                String username = args[3];
                String password = args[4];
                System.err.println("正在获取设备增强版触发模式配置...");
                result = getEnhancedTriggerConfig(ip, port, username, password);
                
            } else if (command.equals("getFtpConfig")) {
                if (args.length < 5) {
                    System.err.println("错误: getFtpConfig需要4个参数: <IP> <端口> <用户名> <密码>");
                    System.out.println("{\"error\": \"参数不足\", \"sdkAvailable\": true, \"mock\": false}");
                    return;
                }
                String ip = args[1];
                int port = Integer.parseInt(args[2]);
                String username = args[3];
                String password = args[4];
                System.err.println("正在获取设备FTP配置...");
                result = getFtpConfig(ip, port, username, password);
                
            } else if (command.equals("getPictureNamingRule")) {
                if (args.length < 5) {
                    System.err.println("错误: getPictureNamingRule需要4个参数: <IP> <端口> <用户名> <密码>");
                    System.out.println("{\"error\": \"参数不足\", \"sdkAvailable\": true, \"mock\": false}");
                    return;
                }
                String ip = args[1];
                int port = Integer.parseInt(args[2]);
                String username = args[3];
                String password = args[4];
                System.err.println("正在获取设备图片命名规则...");
                result = getPictureNamingRule(ip, port, username, password);
                
            } else {
                System.err.println("错误: 未知命令: " + command);
                System.out.println("{\"error\": \"未知命令: " + command + "\", \"sdkAvailable\": true, \"mock\": false}");
                return;
            }
            
            System.out.println(result);
        } finally {
            safeCleanup();
            System.err.println("SDK已清理");
        }
    }
}