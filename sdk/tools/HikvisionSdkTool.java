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
        HCNetSDK INSTANCE = Native.load("libhcnetsdk", HCNetSDK.class);
        
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
     * 主方法 - 用于测试
     */
    public static void main(String[] args) {
        if (args.length < 4) {
            System.out.println("用法: java HikvisionSdkTool <IP> <端口> <用户名> <密码>");
            System.out.println("示例: java HikvisionSdkTool 192.168.1.64 8000 admin admin123");
            return;
        }
        
        String ip = args[0];
        int port = Integer.parseInt(args[1]);
        String username = args[2];
        String password = args[3];
        
        System.out.println("正在初始化SDK...");
        if (!safeInit()) {
            System.out.println("SDK初始化失败");
            return;
        }
        
        try {
            System.out.println("正在获取设备触发模式配置...");
            String result = getTriggerConfig(ip, port, username, password);
            System.out.println("结果: " + result);
        } finally {
            safeCleanup();
            System.out.println("SDK已清理");
        }
    }
}