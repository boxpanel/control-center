import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.Structure;
import com.sun.jna.ptr.IntByReference;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

public class HikvisionTrafficConfigTool {
    private static final int NET_DVR_DEV_ADDRESS_MAX_LEN = 129;
    private static final int NET_DVR_LOGIN_USERNAME_MAX_LEN = 64;
    private static final int NET_DVR_LOGIN_PASSWD_MAX_LEN = 64;
    private static final int SERIALNO_LEN = 48;
    private static final int MAX_ETHERNET = 2;
    private static final int NAME_LEN = 32;
    private static final int PASSWD_LEN = 16;
    private static final int MAX_DOMAIN_NAME = 64;
    private static final int MAX_CUSTOMDIR_LEN = 32;
    private static final int PICNAME_MAXITEM = 15;
    private static final int NET_DVR_GET_NETCFG_V30 = 1000;
    private static final int NET_DVR_SET_NETCFG_V30 = 1001;
    private static final int NET_ITC_GET_FTPCFG = 3121;
    private static final int NET_ITC_SET_FTPCFG = 3122;
    private static final int NET_ITC_GET_TRIGGERCFG = 3003;
    private static final int NET_ITC_SET_TRIGGERCFG = 3004;
    private static final int NET_ITC_GET_VIDEO_TRIGGERCFG = 3017;
    private static final int NET_ITC_SET_VIDEO_TRIGGERCFG = 3018;
    private static final int NET_DVR_GET_TRIGGEREX_CFG = 5074;
    private static final int NET_DVR_SET_TRIGGEREX_CFG = 5075;
    private static final int NET_DVR_GET_SNAPENABLECFG = 1086;
    private static final int NET_DVR_GET_CURTRIGGERMODE = 3130;
    private static final int NET_DVR_SET_CURTRIGGERMODE = 3140;
    private static final Charset DEVICE_CHARSET = StandardCharsets.UTF_8;

    public interface HCNetSDK extends Library {
        boolean NET_DVR_Init();
        boolean NET_DVR_Cleanup();
        boolean NET_DVR_SetConnectTime(int waitTime, int tryTimes);
        boolean NET_DVR_SetReconnect(int interval, boolean enableRecon);
        int NET_DVR_Login_V40(NET_DVR_USER_LOGIN_INFO loginInfo, NET_DVR_DEVICEINFO_V40 deviceInfo);
        boolean NET_DVR_Logout(int userId);
        boolean NET_DVR_GetDVRConfig(int userId, int command, int channel, Pointer outBuffer, int outBufferSize, IntByReference bytesReturned);
        boolean NET_DVR_SetDVRConfig(int userId, int command, int channel, Pointer inBuffer, int inBufferSize);
        boolean NET_DVR_GetDeviceConfig(int userId, int command, int count, Pointer inBuffer, int inBufferSize, Pointer statusList, Pointer outBuffer, int outBufferSize);
        boolean NET_DVR_SetDeviceConfig(int userId, int command, int count, Pointer inBuffer, int inBufferSize, Pointer statusList, Pointer inParamBuffer, int inParamBufferSize);
        int NET_DVR_GetLastError();
    }

    public static class NET_DVR_IPADDR extends Structure {
        public byte[] sIpV4 = new byte[16];
        public byte[] byRes = new byte[128];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("sIpV4", "byRes");
        }
    }

    public static class NET_DVR_ETHERNET_V30 extends Structure {
        public NET_DVR_IPADDR struDVRIP = new NET_DVR_IPADDR();
        public NET_DVR_IPADDR struDVRIPMask = new NET_DVR_IPADDR();
        public int dwNetInterface;
        public short wDVRPort;
        public short wMTU;
        public byte[] byMACAddr = new byte[6];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("struDVRIP", "struDVRIPMask", "dwNetInterface", "wDVRPort", "wMTU", "byMACAddr");
        }
    }

    public static class NET_DVR_PPPOECFG extends Structure {
        public int dwPPPOE;
        public byte[] sPPPoEUser = new byte[32];
        public byte[] sPPPoEPassword = new byte[16];
        public NET_DVR_IPADDR struPPPoEIP = new NET_DVR_IPADDR();

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("dwPPPOE", "sPPPoEUser", "sPPPoEPassword", "struPPPoEIP");
        }
    }

    public static class NET_DVR_NETCFG_V30 extends Structure {
        public int dwSize;
        public NET_DVR_ETHERNET_V30[] struEtherNet = (NET_DVR_ETHERNET_V30[]) new NET_DVR_ETHERNET_V30().toArray(MAX_ETHERNET);
        public NET_DVR_IPADDR[] struRes1 = (NET_DVR_IPADDR[]) new NET_DVR_IPADDR().toArray(2);
        public NET_DVR_IPADDR struAlarmHostIpAddr = new NET_DVR_IPADDR();
        public short[] wRes2 = new short[2];
        public short wAlarmHostIpPort;
        public byte byUseDhcp;
        public byte byRes3;
        public NET_DVR_IPADDR struDnsServer1IpAddr = new NET_DVR_IPADDR();
        public NET_DVR_IPADDR struDnsServer2IpAddr = new NET_DVR_IPADDR();
        public byte[] byIpResolver = new byte[64];
        public short wIpResolverPort;
        public short wHttpPortNo;
        public NET_DVR_IPADDR struMulticastIpAddr = new NET_DVR_IPADDR();
        public NET_DVR_IPADDR struGatewayIpAddr = new NET_DVR_IPADDR();
        public NET_DVR_PPPOECFG struPPPoE = new NET_DVR_PPPOECFG();
        public byte[] byRes = new byte[64];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "dwSize", "struEtherNet", "struRes1", "struAlarmHostIpAddr", "wRes2", "wAlarmHostIpPort",
                    "byUseDhcp", "byRes3", "struDnsServer1IpAddr", "struDnsServer2IpAddr", "byIpResolver",
                    "wIpResolverPort", "wHttpPortNo", "struMulticastIpAddr", "struGatewayIpAddr", "struPPPoE", "byRes"
            );
        }
    }

    public static class NET_DVR_DEVICEINFO_V30 extends Structure {
        public byte[] sSerialNumber = new byte[SERIALNO_LEN];
        public byte byAlarmInPortNum;
        public byte byAlarmOutPortNum;
        public byte byDiskNum;
        public byte byDVRType;
        public byte byChanNum;
        public byte byStartChan;
        public byte byAudioChanNum;
        public byte byIPChanNum;
        public byte byZeroChanNum;
        public byte byMainProto;
        public byte bySubProto;
        public byte bySupport;
        public byte bySupport1;
        public byte bySupport2;
        public short wDevType;
        public byte bySupport3;
        public byte byMultiStreamProto;
        public byte byStartDChan;
        public byte byStartDTalkChan;
        public byte byHighDChanNum;
        public byte bySupport4;
        public byte byLanguageType;
        public byte byVoiceInChanNum;
        public byte byStartVoiceInChanNo;
        public byte bySupport5;
        public byte bySupport6;
        public byte byMirrorChanNum;
        public short wStartMirrorChanNo;
        public byte bySupport7;
        public byte byRes2;

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "sSerialNumber", "byAlarmInPortNum", "byAlarmOutPortNum", "byDiskNum", "byDVRType", "byChanNum",
                    "byStartChan", "byAudioChanNum", "byIPChanNum", "byZeroChanNum", "byMainProto", "bySubProto",
                    "bySupport", "bySupport1", "bySupport2", "wDevType", "bySupport3", "byMultiStreamProto",
                    "byStartDChan", "byStartDTalkChan", "byHighDChanNum", "bySupport4", "byLanguageType",
                    "byVoiceInChanNum", "byStartVoiceInChanNo", "bySupport5", "bySupport6", "byMirrorChanNum",
                    "wStartMirrorChanNo", "bySupport7", "byRes2"
            );
        }
    }

    public static class NET_DVR_DEVICEINFO_V40 extends Structure {
        public NET_DVR_DEVICEINFO_V30 struDeviceV30 = new NET_DVR_DEVICEINFO_V30();
        public byte bySupportLock;
        public byte byRetryLoginTime;
        public byte byPasswordLevel;
        public byte byRes1;
        public int dwSurplusLockTime;
        public byte byCharEncodeType;
        public byte bySupportDev5;
        public byte bySupport;
        public byte byLoginMode;
        public int dwOEMCode;
        public int iResidualValidity;
        public byte byResidualValidity;
        public byte bySingleStartDTalkChan;
        public byte bySingleDTalkChanNums;
        public byte byPassWordResetLevel;
        public byte bySupportStreamEncrypt;
        public byte byMarketType;
        public byte[] byRes2 = new byte[238];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "struDeviceV30", "bySupportLock", "byRetryLoginTime", "byPasswordLevel", "byRes1",
                    "dwSurplusLockTime", "byCharEncodeType", "bySupportDev5", "bySupport", "byLoginMode",
                    "dwOEMCode", "iResidualValidity", "byResidualValidity", "bySingleStartDTalkChan",
                    "bySingleDTalkChanNums", "byPassWordResetLevel", "bySupportStreamEncrypt", "byMarketType", "byRes2"
            );
        }
    }

    public static class NET_DVR_USER_LOGIN_INFO extends Structure {
        public byte[] sDeviceAddress = new byte[NET_DVR_DEV_ADDRESS_MAX_LEN];
        public byte byUseTransport;
        public short wPort;
        public byte[] sUserName = new byte[NET_DVR_LOGIN_USERNAME_MAX_LEN];
        public byte[] sPassword = new byte[NET_DVR_LOGIN_PASSWD_MAX_LEN];
        public Pointer cbLoginResult;
        public Pointer pUser;
        public boolean bUseAsynLogin;
        public byte byProxyType;
        public byte byUseUTCTime;
        public byte byLoginMode;
        public byte byHttps;
        public int iProxyID;
        public byte byVerifyMode;
        public byte[] byRes2 = new byte[119];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "sDeviceAddress", "byUseTransport", "wPort", "sUserName", "sPassword", "cbLoginResult", "pUser",
                    "bUseAsynLogin", "byProxyType", "byUseUTCTime", "byLoginMode", "byHttps", "iProxyID",
                    "byVerifyMode", "byRes2"
            );
        }
    }

    public static class NET_DVR_CURTRIGGERMODE extends Structure {
        public int dwSize;
        public int dwTriggerType;
        public byte[] byRes = new byte[24];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("dwSize", "dwTriggerType", "byRes");
        }
    }

    public static class NET_DVR_TRIGGER_COND extends Structure {
        public int dwSize;
        public int dwChannel;
        public int dwTriggerMode;
        public byte byDetSceneID;
        public byte[] byRes = new byte[63];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("dwSize", "dwChannel", "dwTriggerMode", "byDetSceneID", "byRes");
        }
    }

    public static class NET_ITC_VIDEO_TRIGGER_COND extends Structure {
        public int dwSize;
        public int dwChannel;
        public int dwTriggerMode;
        public byte[] byRes = new byte[16];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("dwSize", "dwChannel", "dwTriggerMode", "byRes");
        }
    }

    public static class NET_ITC_POST_RS485_PARAM extends Structure {
        public byte byRelatedLaneNum;
        public byte byTriggerSpareMode;
        public byte byFaultToleranceTime;
        public byte byRes1;
        public NET_ITC_PLATE_RECOG_PARAM struPlateRecog = new NET_ITC_PLATE_RECOG_PARAM();
        public NET_ITC_LANE_PARAM[] struLane = (NET_ITC_LANE_PARAM[]) new NET_ITC_LANE_PARAM().toArray(6);
        public byte[] byRes = new byte[32];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("byRelatedLaneNum", "byTriggerSpareMode", "byFaultToleranceTime", "byRes1", "struPlateRecog", "struLane", "byRes");
        }
    }

    public static class NET_ITC_SERIAL_INFO extends Structure {
        public byte bySerialProtocol;
        public byte byIntervalType;
        public short wInterval;
        public byte byNormalPassProtocol;
        public byte byInverseProtocol;
        public byte bySpeedProtocol;
        public byte[] byRes = new byte[9];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("bySerialProtocol", "byIntervalType", "wInterval", "byNormalPassProtocol", "byInverseProtocol", "bySpeedProtocol", "byRes");
        }
    }

    public static class NET_ITC_EPOLICE_LANE_PARAM extends Structure {
        public byte byEnable;
        public byte byRelatedDriveWay;
        public short wDistance;
        public byte byRecordEnable;
        public byte byRecordType;
        public byte byPreRecordTime;
        public byte byRecordDelayTime;
        public byte byRecordTimeOut;
        public byte bySignSpeed;
        public byte bySpeedLimit;
        public byte byOverlayDriveWay;
        public NET_ITC_SERIAL_INFO struSerialInfo = new NET_ITC_SERIAL_INFO();
        public byte[] byRelatedIOOut = new byte[4];
        public byte byFlashMode;
        public byte bySerialType;
        public byte byRelatedIOOutEx;
        public byte bySnapPicPreRecord;
        public NET_ITC_PLATE_RECOG_REGION_PARAM[] struPlateRecog = (NET_ITC_PLATE_RECOG_REGION_PARAM[]) new NET_ITC_PLATE_RECOG_REGION_PARAM().toArray(2);
        public byte byBigCarSignSpeed;
        public byte byBigCarSpeedLimit;
        public byte byRedTrafficLightChan;
        public byte byYellowTrafficLightChan;
        public byte byRelaLaneDirectionType;
        public byte[] byRes3 = new byte[11];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byEnable", "byRelatedDriveWay", "wDistance", "byRecordEnable", "byRecordType", "byPreRecordTime",
                    "byRecordDelayTime", "byRecordTimeOut", "bySignSpeed", "bySpeedLimit", "byOverlayDriveWay",
                    "struSerialInfo", "byRelatedIOOut", "byFlashMode", "bySerialType", "byRelatedIOOutEx",
                    "bySnapPicPreRecord", "struPlateRecog", "byBigCarSignSpeed", "byBigCarSpeedLimit",
                    "byRedTrafficLightChan", "byYellowTrafficLightChan", "byRelaLaneDirectionType", "byRes3"
            );
        }
    }

    public static class NET_ITC_EPOLICE_RS485_PARAM extends Structure {
        public byte byRelatedLaneNum;
        public byte byTrafficLightSignalSrc;
        public byte[] byRes1 = new byte[2];
        public NET_ITC_PLATE_RECOG_PARAM struPlateRecog = new NET_ITC_PLATE_RECOG_PARAM();
        public NET_ITC_EPOLICE_LANE_PARAM[] struLane = (NET_ITC_EPOLICE_LANE_PARAM[]) new NET_ITC_EPOLICE_LANE_PARAM().toArray(6);
        public byte[] byRes = new byte[32];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("byRelatedLaneNum", "byTrafficLightSignalSrc", "byRes1", "struPlateRecog", "struLane", "byRes");
        }
    }

    public static class NET_ITC_INTERVAL_PARAM extends Structure {
        public byte byIntervalType;
        public byte[] byRes1 = new byte[3];
        public short[] wInterval = new short[4];
        public byte[] byRes = new byte[8];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("byIntervalType", "byRes1", "wInterval", "byRes");
        }
    }

    public static class NET_ITC_PLATE_RECOG_PARAM extends Structure {
        public byte[] byDefaultCHN = new byte[3];
        public byte byEnable;
        public int dwRecogMode;
        public byte byVehicleLogoRecog;
        public byte byProvince;
        public byte byRegion;
        public byte byCountry;
        public short wPlatePixelWidthMin;
        public short wPlatePixelWidthMax;
        public byte[] byRes = new byte[24];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byDefaultCHN", "byEnable", "dwRecogMode", "byVehicleLogoRecog",
                    "byProvince", "byRegion", "byCountry", "wPlatePixelWidthMin", "wPlatePixelWidthMax", "byRes"
            );
        }
    }

    public static class NET_VCA_POINT extends Structure {
        public float fX;
        public float fY;

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("fX", "fY");
        }
    }

    public static class NET_VCA_RECT extends Structure {
        public float fX;
        public float fY;
        public float fWidth;
        public float fHeight;

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("fX", "fY", "fWidth", "fHeight");
        }
    }

    public static class NET_ITC_POLYGON extends Structure {
        public int dwPointNum;
        public NET_VCA_POINT[] struPos = (NET_VCA_POINT[]) new NET_VCA_POINT().toArray(20);

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("dwPointNum", "struPos");
        }
    }

    public static class NET_ITC_LANE_LOGIC_PARAM extends Structure {
        public byte byUseageType;
        public byte byDirectionType;
        public byte byCarDriveDirect;
        public byte[] byRes = new byte[33];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("byUseageType", "byDirectionType", "byCarDriveDirect", "byRes");
        }
    }

    public static class NET_VCA_LINE extends Structure {
        public NET_VCA_POINT struStart = new NET_VCA_POINT();
        public NET_VCA_POINT struEnd = new NET_VCA_POINT();

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("struStart", "struEnd");
        }
    }

    public static class NET_ITC_LINE extends Structure {
        public NET_VCA_LINE struLine = new NET_VCA_LINE();
        public byte byLineType;
        public byte[] byRes = new byte[7];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("struLine", "byLineType", "byRes");
        }
    }

    public static class NET_ITC_TRAFFIC_LIGHT_PARAM extends Structure {
        public byte bySource;
        public byte[] byRes1 = new byte[3];
        public int[] struLightAccess = new int[122];
        public byte[] byRes = new byte[32];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("bySource", "byRes1", "struLightAccess", "byRes");
        }
    }

    public static class NET_ITC_VIOLATION_DETECT_LINE extends Structure {
        public NET_ITC_LINE struLaneLine = new NET_ITC_LINE();
        public NET_ITC_LINE struStopLine = new NET_ITC_LINE();
        public NET_ITC_LINE struRedLightLine = new NET_ITC_LINE();
        public NET_ITC_LINE struCancelLine = new NET_ITC_LINE();
        public NET_ITC_LINE struWaitLine = new NET_ITC_LINE();
        public NET_ITC_LINE[] struRes = (NET_ITC_LINE[]) new NET_ITC_LINE().toArray(8);

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("struLaneLine", "struStopLine", "struRedLightLine", "struCancelLine", "struWaitLine", "struRes");
        }
    }

    public static class NET_ITC_VIOLATION_DETECT_PARAM extends Structure {
        public int dwVioDetectType;
        public byte byDriveLineSnapTimes;
        public byte byReverseSnapTimes;
        public short wStayTime;
        public byte byNonDriveSnapTimes;
        public byte byChangeLaneTimes;
        public byte bybanTimes;
        public byte byDriveLineSnapSen;
        public short wSnapPosFixPixel;
        public byte bySpeedTimes;
        public byte byTurnAroundEnable;
        public byte byThirdPlateRecogTime;
        public byte byPostSnapTimes;
        public byte[] byRes1 = new byte[18];
        public short wStopLineDis;
        public byte[] byRes = new byte[14];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "dwVioDetectType", "byDriveLineSnapTimes", "byReverseSnapTimes", "wStayTime",
                    "byNonDriveSnapTimes", "byChangeLaneTimes", "bybanTimes", "byDriveLineSnapSen",
                    "wSnapPosFixPixel", "bySpeedTimes", "byTurnAroundEnable", "byThirdPlateRecogTime",
                    "byPostSnapTimes", "byRes1", "wStopLineDis", "byRes"
            );
        }
    }

    public static class NET_ITC_LANE_VIDEO_EPOLICE_PARAM extends Structure {
        public byte byLaneNO;
        public byte bySensitivity;
        public byte byEnableRadar;
        public byte byRelaLaneDirectionType;
        public NET_ITC_LANE_LOGIC_PARAM struLane = new NET_ITC_LANE_LOGIC_PARAM();
        public NET_ITC_VIOLATION_DETECT_PARAM struVioDetect = new NET_ITC_VIOLATION_DETECT_PARAM();
        public NET_ITC_VIOLATION_DETECT_LINE struLine = new NET_ITC_VIOLATION_DETECT_LINE();
        public NET_ITC_POLYGON struPlateRecog = new NET_ITC_POLYGON();
        public byte byRecordEnable;
        public byte byRecordType;
        public byte byPreRecordTime;
        public byte byRecordDelayTime;
        public byte byRecordTimeOut;
        public byte byCarSpeedLimit;
        public byte byCarSignSpeed;
        public byte bySnapPicPreRecord;
        public NET_ITC_INTERVAL_PARAM struInterval = new NET_ITC_INTERVAL_PARAM();
        public byte[] byRes = new byte[36];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byLaneNO", "bySensitivity", "byEnableRadar", "byRelaLaneDirectionType", "struLane",
                    "struVioDetect", "struLine", "struPlateRecog", "byRecordEnable", "byRecordType",
                    "byPreRecordTime", "byRecordDelayTime", "byRecordTimeOut", "byCarSpeedLimit",
                    "byCarSignSpeed", "bySnapPicPreRecord", "struInterval", "byRes"
            );
        }
    }

    public static class NET_ITC_VIDEO_EPOLICE_PARAM extends Structure {
        public byte byEnable;
        public byte byLaneNum;
        public byte byLogicJudge;
        public byte byRes1;
        public NET_ITC_PLATE_RECOG_PARAM struPlateRecog = new NET_ITC_PLATE_RECOG_PARAM();
        public NET_ITC_TRAFFIC_LIGHT_PARAM struTrafficLight = new NET_ITC_TRAFFIC_LIGHT_PARAM();
        public NET_ITC_LANE_VIDEO_EPOLICE_PARAM[] struLaneParam = (NET_ITC_LANE_VIDEO_EPOLICE_PARAM[]) new NET_ITC_LANE_VIDEO_EPOLICE_PARAM().toArray(6);
        public NET_ITC_LINE struLaneBoundaryLine = new NET_ITC_LINE();
        public NET_ITC_LINE struLeftLine = new NET_ITC_LINE();
        public NET_ITC_LINE struRightLine = new NET_ITC_LINE();
        public NET_ITC_LINE struTopZebraLine = new NET_ITC_LINE();
        public NET_ITC_LINE struBotZebraLine = new NET_ITC_LINE();
        public byte[] byRes = new byte[32];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byEnable", "byLaneNum", "byLogicJudge", "byRes1", "struPlateRecog", "struTrafficLight",
                    "struLaneParam", "struLaneBoundaryLine", "struLeftLine", "struRightLine",
                    "struTopZebraLine", "struBotZebraLine", "byRes"
            );
        }
    }

    public static class NET_ITC_VIDEO_TRIGGER_PARAM_UNION extends Structure {
        public int[] uLen = new int[1150];

        @Override
        protected List<String> getFieldOrder() {
            return Collections.singletonList("uLen");
        }

        public NET_ITC_VIDEO_EPOLICE_PARAM asVideoEpolice() {
            NET_ITC_VIDEO_EPOLICE_PARAM value = new NET_ITC_VIDEO_EPOLICE_PARAM();
            value.getPointer().write(0, this.getPointer().getByteArray(0, value.size()), 0, value.size());
            value.read();
            return value;
        }
    }

    public static class NET_ITC_VIDEO_TRIGGER_PARAM extends Structure {
        public int dwSize;
        public int dwMode;
        public NET_ITC_VIDEO_TRIGGER_PARAM_UNION uVideoTrigger = new NET_ITC_VIDEO_TRIGGER_PARAM_UNION();
        public byte[] byRes = new byte[32];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("dwSize", "dwMode", "uVideoTrigger", "byRes");
        }
    }

    public static class NET_ITC_PLATE_RECOG_REGION_PARAM extends Structure {
        public byte byMode;
        public byte[] byRes1 = new byte[3];
        public byte[] uRegion = new byte[164];
        public byte[] byRes = new byte[16];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("byMode", "byRes1", "uRegion", "byRes");
        }
    }

    public static class NET_ITC_SINGLEIO_PARAM extends Structure {
        public byte byDefaultStatus;
        public byte byRelatedDriveWay;
        public byte bySnapTimes;
        public byte byRelatedIOOutEx;
        public NET_ITC_INTERVAL_PARAM struInterval = new NET_ITC_INTERVAL_PARAM();
        public byte[] byRelatedIOOut = new byte[4];
        public byte byFlashMode;
        public byte byEnable;
        public byte byUseageType;
        public byte byEmergencyCapEn;
        public NET_ITC_PLATE_RECOG_REGION_PARAM[] struPlateRecog = (NET_ITC_PLATE_RECOG_REGION_PARAM[]) new NET_ITC_PLATE_RECOG_REGION_PARAM().toArray(2);
        public byte[] byRes = new byte[24];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byDefaultStatus", "byRelatedDriveWay", "bySnapTimes", "byRelatedIOOutEx",
                    "struInterval", "byRelatedIOOut", "byFlashMode", "byEnable", "byUseageType",
                    "byEmergencyCapEn", "struPlateRecog", "byRes"
            );
        }
    }

    public static class NET_ITC_POST_SINGLEIO_PARAM extends Structure {
        public NET_ITC_PLATE_RECOG_PARAM struPlateRecog = new NET_ITC_PLATE_RECOG_PARAM();
        public NET_ITC_SINGLEIO_PARAM[] struSingleIO = (NET_ITC_SINGLEIO_PARAM[]) new NET_ITC_SINGLEIO_PARAM().toArray(8);

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("struPlateRecog", "struSingleIO");
        }
    }

    private static NET_VCA_RECT asRectRegion(NET_ITC_PLATE_RECOG_REGION_PARAM region) {
        NET_VCA_RECT rect = new NET_VCA_RECT();
        rect.getPointer().write(0, region.uRegion, 0, Math.min(rect.size(), region.uRegion.length));
        rect.read();
        return rect;
    }

    private static NET_ITC_POLYGON asPolygonRegion(NET_ITC_PLATE_RECOG_REGION_PARAM region) {
        NET_ITC_POLYGON polygon = new NET_ITC_POLYGON();
        polygon.getPointer().write(0, region.uRegion, 0, Math.min(polygon.size(), region.uRegion.length));
        polygon.read();
        return polygon;
    }

    public static class NET_ITC_LANE_PARAM extends Structure {
        public byte byEnable;
        public byte byRelatedDriveWay;
        public short wDistance;
        public short wTrigDelayTime;
        public byte byTrigDelayDistance;
        public byte bySpeedCapEn;
        public byte bySignSpeed;
        public byte bySpeedLimit;
        public byte bySnapTimes;
        public byte byOverlayDriveWay;
        public NET_ITC_INTERVAL_PARAM struInterval = new NET_ITC_INTERVAL_PARAM();
        public byte[] byRelatedIOOut = new byte[4];
        public byte byFlashMode;
        public byte byCartSignSpeed;
        public byte byCartSpeedLimit;
        public byte byRelatedIOOutEx;
        public NET_ITC_PLATE_RECOG_REGION_PARAM[] struPlateRecog = (NET_ITC_PLATE_RECOG_REGION_PARAM[]) new NET_ITC_PLATE_RECOG_REGION_PARAM().toArray(2);
        public byte byLaneType;
        public byte byUseageType;
        public byte byRelaLaneDirectionType;
        public byte byLowSpeedLimit;
        public byte byBigCarLowSpeedLimit;
        public byte byLowSpeedCapEn;
        public byte byEmergencyCapEn;
        public byte[] byRes = new byte[9];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byEnable", "byRelatedDriveWay", "wDistance", "wTrigDelayTime", "byTrigDelayDistance",
                    "bySpeedCapEn", "bySignSpeed", "bySpeedLimit", "bySnapTimes", "byOverlayDriveWay",
                    "struInterval", "byRelatedIOOut", "byFlashMode", "byCartSignSpeed", "byCartSpeedLimit",
                    "byRelatedIOOutEx", "struPlateRecog", "byLaneType", "byUseageType", "byRelaLaneDirectionType",
                    "byLowSpeedLimit", "byBigCarLowSpeedLimit", "byLowSpeedCapEn", "byEmergencyCapEn", "byRes"
            );
        }
    }

    public static class NET_ITC_RADAR_PARAM extends Structure {
        public byte byRadarType;
        public byte byLevelAngle;
        public short wRadarSensitivity;
        public short wRadarSpeedValidTime;
        public byte[] byRes1 = new byte[2];
        public float fLineCorrectParam;
        public int iConstCorrectParam;
        public byte[] byRes2 = new byte[8];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byRadarType", "byLevelAngle", "wRadarSensitivity", "wRadarSpeedValidTime",
                    "byRes1", "fLineCorrectParam", "iConstCorrectParam", "byRes2"
            );
        }
    }

    public static class NET_ITC_POST_RS485_RADAR_PARAM extends Structure {
        public byte byRelatedLaneNum;
        public byte[] byRes1 = new byte[3];
        public NET_ITC_PLATE_RECOG_PARAM struPlateRecog = new NET_ITC_PLATE_RECOG_PARAM();
        public NET_ITC_LANE_PARAM[] struLane = (NET_ITC_LANE_PARAM[]) new NET_ITC_LANE_PARAM().toArray(6);
        public NET_ITC_RADAR_PARAM struRadar = new NET_ITC_RADAR_PARAM();
        public byte[] byRes = new byte[32];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("byRelatedLaneNum", "byRes1", "struPlateRecog", "struLane", "struRadar", "byRes");
        }
    }

    public static class NET_ITC_POST_VTCOIL_PARAM extends Structure {
        public byte byRelatedLaneNum;
        public byte byIsDisplay;
        public byte byLoopPos;
        public byte byPolarLenType;
        public byte byDayAuxLightMode;
        public byte byVideoLaneNO;
        public byte byVideoLowTh;
        public byte byVideoHighTh;
        public byte byRecordMode;
        public byte bySnapMode;
        public byte bySpeedDetector;
        public byte byRes2;
        public short wResolutionX;
        public short wResolutionY;
        public int dwDayInitExp;
        public int dwDayMaxExp;
        public int dwNightExp;
        public int dwSnapExp;
        public byte byDayInitGain;
        public byte byDayMaxGain;
        public byte byNightGain;
        public byte bySnapGain;
        public int dwSceneMode;
        public byte[] byRest = new byte[1396];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byRelatedLaneNum", "byIsDisplay", "byLoopPos", "byPolarLenType", "byDayAuxLightMode",
                    "byVideoLaneNO", "byVideoLowTh", "byVideoHighTh", "byRecordMode", "bySnapMode", "bySpeedDetector",
                    "byRes2", "wResolutionX", "wResolutionY", "dwDayInitExp", "dwDayMaxExp", "dwNightExp", "dwSnapExp",
                    "byDayInitGain", "byDayMaxGain", "byNightGain", "bySnapGain", "dwSceneMode", "byRest"
            );
        }
    }

    public static class NET_ITC_LANE_HVT_PARAM_V50 extends Structure {
        public byte byLaneNO;
        public byte byFlashMode;
        public byte bySignSpeed;
        public byte bySpeedLimit;
        public byte bySignLowSpeed;
        public byte byLowSpeedLimit;
        public byte byBigCarSignSpeed;
        public byte byBigCarSpeedLimit;
        public byte byBigCarSignLowSpeed;
        public byte byBigCarLowSpeedLimit;
        public byte bySnapTimes;
        public byte byDriveLineSnapTime;
        public byte byHighSpeedSnapTime;
        public byte byLowSpeedSnapTime;
        public byte byBanSnapTime;
        public byte byReverseSnapTime;
        public byte byRelatedDriveWay;
        public byte byLaneType;
        public byte byRelaLaneDirectionType;
        public byte[] byRes1 = new byte[27];
        public byte byChangeLaneEnable;
        public byte byChangeLaneCapNo;
        public int dwVioDetectType;
        public int dwRelatedIOOut;
        public byte[] struTrigLine = new byte[24];
        public byte[] struLineLeft = new byte[24];
        public byte[] struPlateRecog = new byte[164];
        public NET_ITC_LANE_LOGIC_PARAM struLane = new NET_ITC_LANE_LOGIC_PARAM();
        public NET_ITC_INTERVAL_PARAM struInterval = new NET_ITC_INTERVAL_PARAM();
        public byte[] byRes2 = new byte[280];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byLaneNO", "byFlashMode", "bySignSpeed", "bySpeedLimit", "bySignLowSpeed", "byLowSpeedLimit",
                    "byBigCarSignSpeed", "byBigCarSpeedLimit", "byBigCarSignLowSpeed", "byBigCarLowSpeedLimit",
                    "bySnapTimes", "byDriveLineSnapTime", "byHighSpeedSnapTime", "byLowSpeedSnapTime", "byBanSnapTime",
                    "byReverseSnapTime", "byRelatedDriveWay", "byLaneType", "byRelaLaneDirectionType", "byRes1",
                    "byChangeLaneEnable", "byChangeLaneCapNo", "dwVioDetectType", "dwRelatedIOOut", "struTrigLine",
                    "struLineLeft", "struPlateRecog", "struLane", "struInterval", "byRes2"
            );
        }
    }

    public static class NET_ITC_POST_HVT_PARAM_V50 extends Structure {
        public byte byLaneNum;
        public byte byCapType;
        public byte byCapMode;
        public byte bySecneMode;
        public byte bySpeedMode;
        public byte byLineRuleEffect;
        public byte[] byRes1 = new byte[78];
        public byte[] struLeftTrigLine = new byte[24];
        public byte[] struRigtTrigLine = new byte[24];
        public byte[] struLaneBoundaryLine = new byte[24];
        public byte[] struDetectArea = new byte[164];
        public byte[] struGeogLocation = new byte[12];
        public NET_ITC_LANE_HVT_PARAM_V50[] struLaneParam = (NET_ITC_LANE_HVT_PARAM_V50[]) new NET_ITC_LANE_HVT_PARAM_V50().toArray(6);
        public NET_ITC_PLATE_RECOG_PARAM struPlateRecog = new NET_ITC_PLATE_RECOG_PARAM();
        public byte[] byRes2 = new byte[260];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "byLaneNum", "byCapType", "byCapMode", "bySecneMode", "bySpeedMode", "byLineRuleEffect", "byRes1",
                    "struLeftTrigLine", "struRigtTrigLine", "struLaneBoundaryLine", "struDetectArea", "struGeogLocation",
                    "struLaneParam", "struPlateRecog", "byRes2"
            );
        }
    }

    public static class NET_ITC_TRIGGER_PARAM_UNION extends Structure {
        public int[] uLen = new int[1070];

        @Override
        protected List<String> getFieldOrder() {
            return Collections.singletonList("uLen");
        }

        public NET_ITC_POST_SINGLEIO_PARAM asSingleIO() {
            NET_ITC_POST_SINGLEIO_PARAM value = new NET_ITC_POST_SINGLEIO_PARAM();
            value.getPointer().write(0, this.getPointer().getByteArray(0, value.size()), 0, value.size());
            value.read();
            return value;
        }

        public NET_ITC_POST_RS485_PARAM asRs485() {
            NET_ITC_POST_RS485_PARAM value = new NET_ITC_POST_RS485_PARAM();
            value.getPointer().write(0, this.getPointer().getByteArray(0, value.size()), 0, value.size());
            value.read();
            return value;
        }

        public NET_ITC_EPOLICE_RS485_PARAM asEpoliceRs485() {
            NET_ITC_EPOLICE_RS485_PARAM value = new NET_ITC_EPOLICE_RS485_PARAM();
            value.getPointer().write(0, this.getPointer().getByteArray(0, value.size()), 0, value.size());
            value.read();
            return value;
        }

        public NET_ITC_POST_RS485_RADAR_PARAM asRadar() {
            NET_ITC_POST_RS485_RADAR_PARAM value = new NET_ITC_POST_RS485_RADAR_PARAM();
            value.getPointer().write(0, this.getPointer().getByteArray(0, value.size()), 0, value.size());
            value.read();
            return value;
        }

        public NET_ITC_POST_VTCOIL_PARAM asVtCoil() {
            NET_ITC_POST_VTCOIL_PARAM value = new NET_ITC_POST_VTCOIL_PARAM();
            value.getPointer().write(0, this.getPointer().getByteArray(0, value.size()), 0, value.size());
            value.read();
            return value;
        }

        public NET_ITC_POST_HVT_PARAM_V50 asHvtV50() {
            NET_ITC_POST_HVT_PARAM_V50 value = new NET_ITC_POST_HVT_PARAM_V50();
            value.getPointer().write(0, this.getPointer().getByteArray(0, value.size()), 0, value.size());
            value.read();
            return value;
        }
    }

    public static class NET_ITC_SINGLE_TRIGGERCFG extends Structure {
        public byte byEnable;
        public byte[] byRes1 = new byte[3];
        public int dwTriggerType;
        public NET_ITC_TRIGGER_PARAM_UNION uTriggerParam = new NET_ITC_TRIGGER_PARAM_UNION();
        public byte[] byRes = new byte[64];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("byEnable", "byRes1", "dwTriggerType", "uTriggerParam", "byRes");
        }
    }

    public static class NET_ITC_TRIGGERCFG extends Structure {
        public int dwSize;
        public NET_ITC_SINGLE_TRIGGERCFG struTriggerParam = new NET_ITC_SINGLE_TRIGGERCFG();
        public byte[] byRes = new byte[32];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("dwSize", "struTriggerParam", "byRes");
        }
    }

    public static class NET_DVR_PICTURE_NAME extends Structure {
        public byte[] byItemOrder = new byte[PICNAME_MAXITEM];
        public byte byDelimiter;

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("byItemOrder", "byDelimiter");
        }
    }

    public static class NET_ITC_FTP_CFG extends Structure {
        public int dwSize;
        public byte byEnable;
        public byte byAddressType;
        public short wFTPPort;
        public byte[] unionServer = new byte[144];
        public byte[] szUserName = new byte[NAME_LEN];
        public byte[] szPassWORD = new byte[PASSWD_LEN];
        public byte byRes4;
        public byte byDirLevel;
        public byte byIsFilterCarPic;
        public byte byUploadDataType;
        public NET_DVR_PICTURE_NAME struPicNameRule = new NET_DVR_PICTURE_NAME();
        public byte byTopDirMode;
        public byte bySubDirMode;
        public byte byThreeDirMode;
        public byte byFourDirMode;
        public byte[] szPicNameCustom = new byte[MAX_CUSTOMDIR_LEN];
        public byte[] szTopCustomDir = new byte[MAX_CUSTOMDIR_LEN];
        public byte[] szSubCustomDir = new byte[MAX_CUSTOMDIR_LEN];
        public byte[] szThreeCustomDir = new byte[MAX_CUSTOMDIR_LEN];
        public byte[] szFourCustomDir = new byte[MAX_CUSTOMDIR_LEN];
        public byte[] byRes3 = new byte[900];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "dwSize", "byEnable", "byAddressType", "wFTPPort", "unionServer",
                    "szUserName", "szPassWORD", "byRes4", "byDirLevel", "byIsFilterCarPic", "byUploadDataType",
                    "struPicNameRule", "byTopDirMode", "bySubDirMode", "byThreeDirMode", "byFourDirMode",
                    "szPicNameCustom", "szTopCustomDir", "szSubCustomDir", "szThreeCustomDir", "szFourCustomDir", "byRes3"
            );
        }
    }

    public static class NET_ITC_FTP_TYPE_COND extends Structure {
        public int dwChannel;
        public byte byWorkMode;
        public byte[] byRes = new byte[7];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("dwChannel", "byWorkMode", "byRes");
        }
    }

    public static class NET_DVR_SNAPENABLECFG extends Structure {
        public int dwSize;
        public byte byPlateEnable;
        public byte[] byRes1 = new byte[2];
        public byte byFrameFlip;
        public short wFlipAngle;
        public short wLightPhase;
        public byte byLightSyncPower;
        public byte byFrequency;
        public byte byUploadSDEnable;
        public byte byPlateMode;
        public byte byUploadInfoFTP;
        public byte byAutoFormatSD;
        public short wJpegPicSize;
        public byte bySnapPicResolution;
        public byte[] byRes = new byte[55];

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList(
                    "dwSize", "byPlateEnable", "byRes1", "byFrameFlip", "wFlipAngle", "wLightPhase",
                    "byLightSyncPower", "byFrequency", "byUploadSDEnable", "byPlateMode", "byUploadInfoFTP",
                    "byAutoFormatSD", "wJpegPicSize", "bySnapPicResolution", "byRes"
            );
        }
    }

    private static HCNetSDK sdk;

    public static void main(String[] args) {
        String action = arg(args, 0, "");
        String ip = arg(args, 1, "");
        int port = parseInt(arg(args, 2, "8000"), 8000);
        String username = arg(args, 3, "admin");
        String password = arg(args, 4, "");

        try {
            sdk = loadSdk();
            if (!sdk.NET_DVR_Init()) {
                fail("NET_DVR_Init failed", sdk.NET_DVR_GetLastError());
                return;
            }

            sdk.NET_DVR_SetConnectTime(5000, 1);
            sdk.NET_DVR_SetReconnect(10000, true);

            NET_DVR_USER_LOGIN_INFO loginInfo = new NET_DVR_USER_LOGIN_INFO();
            fillBytes(loginInfo.sDeviceAddress, ip);
            fillBytes(loginInfo.sUserName, username);
            fillBytes(loginInfo.sPassword, password);
            loginInfo.wPort = (short) port;
            loginInfo.byUseTransport = 0;
            loginInfo.bUseAsynLogin = false;
            loginInfo.byLoginMode = 0;
            loginInfo.write();

            NET_DVR_DEVICEINFO_V40 deviceInfo = new NET_DVR_DEVICEINFO_V40();
            int userId = sdk.NET_DVR_Login_V40(loginInfo, deviceInfo);
            if (userId < 0) {
                fail("NET_DVR_Login_V40 failed", sdk.NET_DVR_GetLastError());
                sdk.NET_DVR_Cleanup();
                return;
            }

            deviceInfo.read();

            try {
                switch (action) {
                    case "device-info":
                        success(buildDeviceInfo(deviceInfo, ip, port, username));
                        break;
                    case "network-config":
                        success(buildNetworkConfig(userId));
                        break;
                    case "set-network-config":
                        success(applyNetworkConfig(userId, args));
                        break;
                    case "itc-ftp-config":
                        success(buildItcFtpConfig(userId));
                        break;
                    case "set-itc-ftp-config":
                        success(applyItcFtpConfig(userId, args));
                        break;
                    case "current-trigger-mode":
                        success(buildCurrentTriggerMode(userId));
                        break;
                    case "set-current-trigger-mode":
                        success(applyCurrentTriggerMode(userId, args));
                        break;
                    case "trigger-config":
                        success(buildTriggerConfig(userId));
                        break;
                    case "set-trigger-config":
                        success(applyTriggerConfig(userId, args));
                        break;
                    default:
                        fail("Unsupported action: " + action, 0);
                        break;
                }
            } finally {
                sdk.NET_DVR_Logout(userId);
                sdk.NET_DVR_Cleanup();
            }
        } catch (Exception error) {
            fail(error.getMessage(), 0);
        }
    }

    private static HCNetSDK loadSdk() {
        String libDir = withDefault(System.getenv("HIKVISION_SDK_LIB"), "");
        if (!libDir.isEmpty()) {
            String current = withDefault(System.getProperty("jna.library.path"), "");
            if (current.isEmpty()) {
                System.setProperty("jna.library.path", libDir);
            } else if (!current.contains(libDir)) {
                System.setProperty("jna.library.path", libDir + java.io.File.pathSeparator + current);
            }
        }
        return Native.loadLibrary("hcnetsdk", HCNetSDK.class);
    }

    private static String buildDeviceInfo(NET_DVR_DEVICEINFO_V40 deviceInfo, String ip, int port, String username) {
        String serial = trimZero(deviceInfo.struDeviceV30.sSerialNumber);
        int charEncodingType = unsignedByte(deviceInfo.byCharEncodeType);
        int channelCount = unsignedByte(deviceInfo.struDeviceV30.byChanNum);
        int alarmIn = unsignedByte(deviceInfo.struDeviceV30.byAlarmInPortNum);
        int alarmOut = unsignedByte(deviceInfo.struDeviceV30.byAlarmOutPortNum);

        return "{"
                + "\"success\":true,"
                + "\"message\":\"SDK device info loaded\","
                + "\"deviceInfo\":{"
                + "\"ip\":\"" + json(ip) + "\","
                + "\"port\":" + port + ","
                + "\"username\":\"" + json(username) + "\","
                + "\"serialNumber\":\"" + json(serial) + "\","
                + "\"channelCount\":" + channelCount + ","
                + "\"alarmInCount\":" + alarmIn + ","
                + "\"alarmOutCount\":" + alarmOut + ","
                + "\"charEncodeType\":" + charEncodingType + ","
                + "\"charEncodeLabel\":\"" + json(getEncodingLabel(charEncodingType)) + "\","
                + "\"loginMode\":" + unsignedByte(deviceInfo.byLoginMode) + ","
                + "\"marketType\":" + unsignedByte(deviceInfo.byMarketType)
                + "}"
                + "}";
    }

    private static String buildNetworkConfig(int userId) {
        NET_DVR_NETCFG_V30 config = loadNetworkConfigStruct(userId);
        if (config == null) return "";

        NET_DVR_ETHERNET_V30 eth = config.struEtherNet[0];
        String ip = ipString(eth.struDVRIP);
        String mask = ipString(eth.struDVRIPMask);
        String gateway = ipString(config.struGatewayIpAddr);
        String dns1 = ipString(config.struDnsServer1IpAddr);
        String dns2 = ipString(config.struDnsServer2IpAddr);
        String alarmHost = ipString(config.struAlarmHostIpAddr);
        String mac = macString(eth.byMACAddr);
        int httpPort = unsignedShort(config.wHttpPortNo);
        int sdkPort = unsignedShort(eth.wDVRPort);
        int mtu = unsignedShort(eth.wMTU);
        boolean dhcpEnabled = unsignedByte(config.byUseDhcp) == 1;

        return "{"
                + "\"success\":true,"
                + "\"message\":\"SDK network config loaded\","
                + "\"networkConfig\":{"
                + "\"ipAddress\":\"" + json(ip) + "\","
                + "\"subnetMask\":\"" + json(mask) + "\","
                + "\"gateway\":\"" + json(gateway) + "\","
                + "\"dns1\":\"" + json(dns1) + "\","
                + "\"dns2\":\"" + json(dns2) + "\","
                + "\"dhcpEnabled\":" + dhcpEnabled + ","
                + "\"dhcpEnabledLabel\":\"" + json(dhcpEnabled ? "Enabled" : "Disabled") + "\","
                + "\"sdkPort\":" + sdkPort + ","
                + "\"httpPort\":" + httpPort + ","
                + "\"mtu\":" + mtu + ","
                + "\"macAddress\":\"" + json(mac) + "\","
                + "\"netInterfaceCode\":" + eth.dwNetInterface + ","
                + "\"netInterfaceLabel\":\"" + json(getNetInterfaceLabel(eth.dwNetInterface)) + "\","
                + "\"alarmHostIp\":\"" + json(alarmHost) + "\","
                + "\"alarmHostPort\":" + unsignedShort(config.wAlarmHostIpPort)
                + "}"
                + "}";
    }

    private static String applyNetworkConfig(int userId, String[] args) {
        NET_DVR_NETCFG_V30 config = loadNetworkConfigStruct(userId);
        if (config == null) return "";

        NET_DVR_ETHERNET_V30 eth = config.struEtherNet[0];
        writeIpString(eth.struDVRIP, arg(args, 5, ipString(eth.struDVRIP)));
        writeIpString(eth.struDVRIPMask, arg(args, 6, ipString(eth.struDVRIPMask)));
        writeIpString(config.struGatewayIpAddr, arg(args, 7, ipString(config.struGatewayIpAddr)));
        writeIpString(config.struDnsServer1IpAddr, arg(args, 8, ipString(config.struDnsServer1IpAddr)));
        writeIpString(config.struDnsServer2IpAddr, arg(args, 9, ipString(config.struDnsServer2IpAddr)));
        config.byUseDhcp = (byte) (parseBooleanFlag(arg(args, 10, unsignedByte(config.byUseDhcp) == 1 ? "1" : "0")) ? 1 : 0);

        int sdkPort = parseInt(arg(args, 11, String.valueOf(unsignedShort(eth.wDVRPort))), unsignedShort(eth.wDVRPort));
        int httpPort = parseInt(arg(args, 12, String.valueOf(unsignedShort(config.wHttpPortNo))), unsignedShort(config.wHttpPortNo));
        int mtu = parseInt(arg(args, 13, String.valueOf(unsignedShort(eth.wMTU))), unsignedShort(eth.wMTU));
        writeIpString(config.struAlarmHostIpAddr, arg(args, 14, ipString(config.struAlarmHostIpAddr)));
        int alarmHostPort = parseInt(arg(args, 15, String.valueOf(unsignedShort(config.wAlarmHostIpPort))), unsignedShort(config.wAlarmHostIpPort));

        eth.wDVRPort = (short) sdkPort;
        config.wHttpPortNo = (short) httpPort;
        eth.wMTU = (short) mtu;
        config.wAlarmHostIpPort = (short) alarmHostPort;

        config.write();
        boolean ok = sdk.NET_DVR_SetDVRConfig(userId, NET_DVR_SET_NETCFG_V30, 0, config.getPointer(), config.size());
        if (!ok) {
            fail("NET_DVR_SetDVRConfig(NETCFG) failed", sdk.NET_DVR_GetLastError());
            return "";
        }
        return buildNetworkConfig(userId);
    }

    private static String buildCurrentTriggerMode(int userId) {
        NET_DVR_CURTRIGGERMODE current = loadCurrentTriggerModeStruct(userId);
        if (current == null) return "";

        int triggerType = current.dwTriggerType;
        String label = getTriggerTypeLabel(triggerType);

        return "{"
                + "\"success\":true,"
                + "\"message\":\"SDK current trigger mode loaded\","
                + "\"currentTriggerMode\":{"
                + "\"rawValues\":{"
                + "\"triggerTypeCode\":" + triggerType
                + "},"
                + "\"triggerTypeCode\":" + triggerType + ","
                + "\"triggerTypeHex\":\"" + json(toHex(triggerType)) + "\","
                + "\"triggerTypeLabel\":\"" + json(label) + "\","
                + "\"summary\":\"" + json(label + " (" + toHex(triggerType) + ")") + "\""
                + "}"
                + "}";
    }

    private static String applyCurrentTriggerMode(int userId, String[] args) {
        NET_DVR_CURTRIGGERMODE current = loadCurrentTriggerModeStruct(userId);
        if (current == null) return "";
        int triggerType = parseInt(arg(args, 5, String.valueOf(current.dwTriggerType)), current.dwTriggerType);
        if (!setCurrentTriggerModeStruct(userId, current, triggerType)) {
            return "";
        }
        return buildCurrentTriggerMode(userId);
    }

    private static String buildItcFtpConfig(int userId) {
        NET_ITC_FTP_TYPE_COND condition = new NET_ITC_FTP_TYPE_COND();
        condition.dwChannel = 1;
        condition.byWorkMode = 0;
        condition.write();

        NET_ITC_FTP_CFG config = new NET_ITC_FTP_CFG();
        config.dwSize = config.size();
        config.write();
        IntByReference statusList = new IntByReference(0);
        boolean ok = sdk.NET_DVR_GetDeviceConfig(
                userId,
                NET_ITC_GET_FTPCFG,
                1,
                condition.getPointer(),
                condition.size(),
                statusList.getPointer(),
                config.getPointer(),
                config.size()
        );
        if (!ok) {
            fail("NET_DVR_GetDeviceConfig(ITC_FTP_CFG) failed", sdk.NET_DVR_GetLastError());
            return "";
        }
        int status = statusList.getValue();
        if (status != 0 && status != 1) {
            fail("NET_DVR_GetDeviceConfig(ITC_FTP_CFG) returned status=" + status, status);
            return "";
        }
        config.read();

        boolean enabled = unsignedByte(config.byEnable) == 1;
        boolean useDomain = unsignedByte(config.byAddressType) == 1;
        String serverAddress = useDomain
                ? trimZero(config.unionServer, MAX_DOMAIN_NAME)
                : trimZero(Arrays.copyOfRange(config.unionServer, 0, 16));
        String username = trimZero(config.szUserName);
        String passwordMasked = trimZero(config.szPassWORD).isEmpty() ? "" : "******";
        int ftpPort = unsignedShort(config.wFTPPort);
        int dirLevel = unsignedByte(config.byDirLevel);
        int uploadDataType = unsignedByte(config.byUploadDataType);
        int ftpServerType = unsignedByte(config.byRes4);
        boolean filterCarPic = unsignedByte(config.byIsFilterCarPic) == 1;
        NET_DVR_SNAPENABLECFG snapEnableCfg = loadSnapEnableConfigStruct(userId);
        boolean uploadAdditionalInfo = snapEnableCfg != null && unsignedByte(snapEnableCfg.byUploadInfoFTP) == 1;

        String namingElements = buildPictureNameRule(config.struPicNameRule, trimZero(config.szPicNameCustom));
        String fileNameFormat = buildPictureNameFormat(config.struPicNameRule, trimZero(config.szPicNameCustom));
        String delimiter = delimiterString(config.struPicNameRule.byDelimiter);
        String example = buildPictureNameExample(config.struPicNameRule, trimZero(config.szPicNameCustom), delimiter);

        StringBuilder sb = new StringBuilder();
        sb.append("{\"success\":true,");
        sb.append("\"message\":\"SDK ITC FTP config loaded\",");
        sb.append("\"ftpConfig\":{");
        sb.append("\"ftpEnabled\":\"").append(json(enabled ? "已启用" : "已禁用")).append("\",");
        sb.append("\"ftpServer\":\"").append(json(serverAddress)).append("\",");
        sb.append("\"ftpPort\":\"").append(json(String.valueOf(ftpPort))).append("\",");
        sb.append("\"ftpUsername\":\"").append(json(username)).append("\",");
        sb.append("\"ftpPassword\":\"").append(json(passwordMasked)).append("\",");
        sb.append("\"ftpDirectory\":\"").append(json(buildDirectorySummary(config))).append("\",");
        sb.append("\"ftpUploadMode\":\"").append(json(dirLevelLabel(dirLevel))).append("\",");
        sb.append("\"ftpUploadInterval\":\"").append(json("0")).append("\",");
        sb.append("\"ftpImageQuality\":\"\",");
        sb.append("\"ftpImageResolution\":\"\",");
        sb.append("\"uploadAdditionalInfo\":\"").append(json(uploadAdditionalInfo ? "已启用" : "未启用")).append("\",");
        sb.append("\"ftpUploadType\":\"").append(json(uploadDataTypeLabel(uploadDataType))).append("\",");
        sb.append("\"ftpFileNameFormat\":\"").append(json(fileNameFormat)).append("\",");
        sb.append("\"ftpImageFormat\":\"JPEG\"");
        sb.append("},");
        sb.append("\"namingRules\":{");
        sb.append("\"fileNameFormat\":\"").append(json(fileNameFormat)).append("\",");
        sb.append("\"namingRuleEnabled\":\"").append(json(namingElements.isEmpty() ? "未配置" : "已启用")).append("\",");
        sb.append("\"prefix\":\"").append(json(trimZero(config.szPicNameCustom))).append("\",");
        sb.append("\"dateFormat\":\"").append(json(fileNameFormat.contains("时间") ? "YYYYMMDDHHmmss" : "")).append("\",");
        sb.append("\"timeFormat\":\"").append(json(fileNameFormat.contains("时间") ? "HHmmss" : "")).append("\",");
        sb.append("\"includeChannelNumber\":\"").append(json(boolLabel(containsPictureItem(config.struPicNameRule, 5)))).append("\",");
        sb.append("\"includeSequenceNumber\":\"").append(json(boolLabel(containsPictureItem(config.struPicNameRule, 13) || containsPictureItem(config.struPicNameRule, 14)))).append("\",");
        sb.append("\"includeCameraName\":\"").append(json(boolLabel(containsPictureItem(config.struPicNameRule, 1) || containsPictureItem(config.struPicNameRule, 4)))).append("\",");
        sb.append("\"includePlateNumber\":\"").append(json(boolLabel(containsPictureItem(config.struPicNameRule, 8)))).append("\",");
        sb.append("\"includeTimestamp\":\"").append(json(boolLabel(containsPictureItem(config.struPicNameRule, 6)))).append("\",");
        sb.append("\"includeEventType\":\"").append(json(boolLabel(containsPictureItem(config.struPicNameRule, 22)))).append("\",");
        sb.append("\"fileExtension\":\".jpg\",");
        sb.append("\"namingElements\":\"").append(json(namingElements)).append("\",");
        sb.append("\"example\":\"").append(json(example)).append("\"");
        sb.append("},");
        sb.append("\"itcFtpMeta\":{");
        sb.append("\"enable\":").append(enabled ? 1 : 0).append(",");
        sb.append("\"addressType\":").append(unsignedByte(config.byAddressType)).append(",");
        sb.append("\"dirLevel\":").append(dirLevel).append(",");
        sb.append("\"filterCarPic\":").append(filterCarPic ? 1 : 0).append(",");
        sb.append("\"uploadDataType\":").append(uploadDataType).append(",");
        sb.append("\"ftpIndex\":").append(ftpServerType).append(",");
        sb.append("\"topDirMode\":").append(unsignedByte(config.byTopDirMode)).append(",");
        sb.append("\"subDirMode\":").append(unsignedByte(config.bySubDirMode)).append(",");
        sb.append("\"threeDirMode\":").append(unsignedByte(config.byThreeDirMode)).append(",");
        sb.append("\"fourDirMode\":").append(unsignedByte(config.byFourDirMode)).append(",");
        sb.append("\"delimiterRaw\":").append(config.struPicNameRule.byDelimiter & 0xFF).append(",");
        sb.append("\"picNameItems\":[");
        {
            boolean firstItem = true;
            for (byte code : config.struPicNameRule.byItemOrder) {
                int item = code & 0xFF;
                if (!firstItem) sb.append(",");
                firstItem = false;
                sb.append(item);
            }
        }
        sb.append("],");
        sb.append("\"serverTypeLabel\":\"").append(json(ftpServerTypeLabel(ftpServerType))).append("\",");
        sb.append("\"addressTypeLabel\":\"").append(json(useDomain ? "域名" : "IP地址")).append("\",");
        sb.append("\"isFilterCarPicLabel\":\"").append(json(filterCarPic ? "不上传" : "上传")).append("\",");
        sb.append("\"uploadAdditionalInfo\":").append(uploadAdditionalInfo ? "true" : "false").append(",");
        sb.append("\"uploadAdditionalInfoLabel\":\"").append(json(uploadAdditionalInfo ? "启用" : "未启用")).append("\",");
        sb.append("\"topDirModeLabel\":\"").append(json(dirModeLabel(unsignedByte(config.byTopDirMode)))).append("\",");
        sb.append("\"subDirModeLabel\":\"").append(json(dirModeLabel(unsignedByte(config.bySubDirMode)))).append("\",");
        sb.append("\"threeDirModeLabel\":\"").append(json(dirModeLabel(unsignedByte(config.byThreeDirMode)))).append("\",");
        sb.append("\"fourDirModeLabel\":\"").append(json(dirModeLabel(unsignedByte(config.byFourDirMode)))).append("\",");
        sb.append("\"delimiter\":\"").append(json(delimiter)).append("\"");
        sb.append("}");
        sb.append("}");

        return sb.toString();
    }

    private static String applyItcFtpConfig(int userId, String[] args) {
        NET_ITC_FTP_TYPE_COND condition = new NET_ITC_FTP_TYPE_COND();
        condition.dwChannel = 1;
        condition.byWorkMode = 0;
        condition.write();

        NET_ITC_FTP_CFG config = new NET_ITC_FTP_CFG();
        config.dwSize = config.size();
        config.write();
        IntByReference statusList = new IntByReference(0);
        boolean ok = sdk.NET_DVR_GetDeviceConfig(
                userId,
                NET_ITC_GET_FTPCFG,
                1,
                condition.getPointer(),
                condition.size(),
                statusList.getPointer(),
                config.getPointer(),
                config.size()
        );
        if (!ok) {
            fail("读取现有FTP配置失败", sdk.NET_DVR_GetLastError());
            return "";
        }
        config.read();

        config.byEnable = (byte) (parseBooleanFlag(arg(args, 5, "")) ? 1 : 0);
        config.byAddressType = (byte) parseInt(arg(args, 6, "0"), 0);
        config.wFTPPort = (short) parseInt(arg(args, 7, "21"), 21);
        fillBytes(config.szUserName, arg(args, 8, ""));
        fillBytes(config.szPassWORD, arg(args, 9, ""));
        config.byDirLevel = (byte) parseInt(arg(args, 10, "0"), 0);
        config.byIsFilterCarPic = (byte) (parseBooleanFlag(arg(args, 11, "0")) ? 1 : 0);
        config.byUploadDataType = (byte) parseInt(arg(args, 12, "0"), 0);
        config.byRes4 = (byte) parseInt(arg(args, 13, "0"), 0);
        config.byTopDirMode = (byte) parseInt(arg(args, 14, "0"), 0);
        config.bySubDirMode = (byte) parseInt(arg(args, 15, "0"), 0);
        config.byThreeDirMode = (byte) parseInt(arg(args, 16, "0"), 0);
        config.byFourDirMode = (byte) parseInt(arg(args, 17, "0"), 0);

        String serverAddress = arg(args, 18, "");
        if (!serverAddress.isEmpty()) {
            if (config.byAddressType == 1) {
                fillBytes(config.unionServer, serverAddress);
            } else {
                byte[] ipBytes = serverAddress.getBytes(DEVICE_CHARSET);
                int ipLen = Math.min(ipBytes.length, 15);
                Arrays.fill(config.unionServer, (byte) 0);
                System.arraycopy(ipBytes, 0, config.unionServer, 0, ipLen);
            }
        }

        String picNameDelimiter = arg(args, 19, "0");
        config.struPicNameRule.byDelimiter = (byte) parseInt(picNameDelimiter, 0);
        String picNameItemsRaw = arg(args, 20, "");
        if (!picNameItemsRaw.isEmpty()) {
            byte[] picNameItems = new byte[PICNAME_MAXITEM];
            String[] parts = picNameItemsRaw.split(",");
            for (int i = 0; i < Math.min(parts.length, PICNAME_MAXITEM); i++) {
                picNameItems[i] = (byte) parseInt(parts[i].trim(), 0);
            }
            config.struPicNameRule.byItemOrder = picNameItems;
        }
        fillBytes(config.szPicNameCustom, arg(args, 21, ""));
        fillBytes(config.szTopCustomDir, arg(args, 22, ""));
        fillBytes(config.szSubCustomDir, arg(args, 23, ""));
        fillBytes(config.szThreeCustomDir, arg(args, 24, ""));
        fillBytes(config.szFourCustomDir, arg(args, 25, ""));

        config.write();
        IntByReference setStatusList = new IntByReference(0);
        boolean setOk = sdk.NET_DVR_SetDeviceConfig(
                userId,
                NET_ITC_SET_FTPCFG,
                1,
                condition.getPointer(),
                condition.size(),
                setStatusList.getPointer(),
                config.getPointer(),
                config.size()
        );
        if (!setOk) {
            fail("NET_DVR_SetDeviceConfig(ITC_FTP_CFG) failed", sdk.NET_DVR_GetLastError());
            return "";
        }
        int setStatus = setStatusList.getValue();
        if (setStatus != 0 && setStatus != 1) {
            fail("NET_DVR_SetDeviceConfig(ITC_FTP_CFG) returned status=" + setStatus, setStatus);
            return "";
        }

        return buildItcFtpConfig(userId);
    }

    private static String buildTriggerConfig(int userId) {
        NET_DVR_CURTRIGGERMODE currentMode = loadCurrentTriggerModeStruct(userId);
        int currentTriggerType = currentMode == null ? 0 : currentMode.dwTriggerType;
        if (currentTriggerType == 0x20000) {
            return buildVideoEpoliceTriggerConfig(userId);
        }
        NET_ITC_TRIGGERCFG config = loadTriggerConfigStruct(userId, currentTriggerType);
        if (config == null) {
            // Basic trigger types without configurable parameters
            return "{"
                    + "\"success\":true,"
                    + "\"message\":\"SDK trigger config loaded (basic type)\","
                    + "\"triggerConfig\":{"
                    + "\"rawValues\":{"
                    + "\"triggerTypeCode\":" + currentTriggerType + ","
                    + "\"enabled\":1"
                    + "},"
                    + "\"enabled\":true,"
                    + "\"enabledLabel\":\"Enabled\","
                    + "\"triggerTypeCode\":" + currentTriggerType + ","
                    + "\"triggerTypeHex\":\"" + json(toHex(currentTriggerType)) + "\","
                    + "\"triggerTypeLabel\":\"" + json(getTriggerTypeLabel(currentTriggerType)) + "\","
                    + "\"detailSource\":\"raw\","
                    + "\"laneCount\":0,"
                    + "\"triggerSpareMode\":null,"
                    + "\"triggerSpareModeLabel\":\"\","
                    + "\"faultToleranceMinutes\":null,"
                    + "\"displayEnabled\":null,"
                    + "\"displayEnabledLabel\":\"\","
                    + "\"snapMode\":null,"
                    + "\"snapModeLabel\":\"\","
                    + "\"speedDetector\":null,"
                    + "\"speedDetectorLabel\":\"\","
                    + "\"sceneMode\":null,"
                    + "\"sceneModeLabel\":\"\","
                    + "\"capType\":null,"
                    + "\"capTypeLabel\":\"\","
                    + "\"capMode\":null,"
                    + "\"capModeLabel\":\"\","
                    + "\"speedMode\":null,"
                    + "\"speedModeLabel\":\"\","
                    + "\"radarType\":null,"
                    + "\"radarTypeLabel\":\"\","
                    + "\"levelAngle\":null,"
                    + "\"radarSensitivity\":null,"
                    + "\"radarSpeedValidTime\":null,"
                    + "\"lineCorrectParam\":null,"
                    + "\"constCorrectParam\":null,"
                    + "\"plateRecogEnabled\":null,"
                    + "\"plateRecogEnabledLabel\":\"\","
                    + "\"plateRecogMode\":null,"
                    + "\"vehicleLogoRecogEnabled\":null,"
                    + "\"vehicleLogoRecogEnabledLabel\":\"\","
                    + "\"plateProvince\":null,"
                    + "\"plateRegion\":null,"
                    + "\"plateCountry\":null,"
                    + "\"platePixelWidthMin\":null,"
                    + "\"platePixelWidthMax\":null,"
                    + "\"firstLaneEnabled\":null,"
                    + "\"firstLaneEnabledLabel\":\"\","
                    + "\"firstLaneRelatedDriveWay\":null,"
                    + "\"firstLaneDistance\":null,"
                    + "\"firstLaneTrigDelayTime\":null,"
                    + "\"firstLaneTrigDelayDistance\":null,"
                    + "\"firstLaneSpeedCapEnabled\":null,"
                    + "\"firstLaneSpeedCapEnabledLabel\":\"\","
                    + "\"firstLaneSignSpeed\":null,"
                    + "\"firstLaneSpeedLimit\":null,"
                    + "\"firstLaneSnapTimes\":null,"
                    + "\"firstLaneOverlayDriveWay\":null,"
                    + "\"firstLaneFlashMode\":null,"
                    + "\"firstLaneCartSignSpeed\":null,"
                    + "\"firstLaneCartSpeedLimit\":null,"
                    + "\"firstLaneRelatedIOOutEx\":null,"
                    + "\"firstLaneLaneType\":null,"
                    + "\"firstLaneUseageType\":null,"
                    + "\"firstLaneDirectionType\":null,"
                    + "\"firstLaneLowSpeedLimit\":null,"
                    + "\"firstLaneBigCarLowSpeedLimit\":null,"
                    + "\"firstLaneLowSpeedCapEnabled\":null,"
                    + "\"firstLaneLowSpeedCapEnabledLabel\":\"\","
                    + "\"firstLaneEmergencyCapEnabled\":null,"
                    + "\"firstLaneEmergencyCapEnabledLabel\":\"\","
                    + "\"firstLaneRegionMode\":null,"
                    + "\"firstLaneRegionPoints\":\"\","
                    + "\"firstLaneRegionPointCount\":null,"
                    + "\"summary\":\"" + json(getTriggerTypeLabel(currentTriggerType)) + "\""
                    + "}"
                    + "}";
        }

        NET_ITC_SINGLE_TRIGGERCFG trigger = config.struTriggerParam;
        int triggerType = trigger.dwTriggerType;
        String triggerLabel = getTriggerTypeLabel(triggerType);
        boolean enabled = unsignedByte(trigger.byEnable) == 1;

        int laneCount = 0;
        String detailSource = "raw";
        Integer triggerSpareMode = null;
        String triggerSpareModeLabel = "";
        Integer faultToleranceMinutes = null;
        Boolean displayEnabled = null;
        String displayEnabledLabel = "";
        Integer snapMode = null;
        String snapModeLabel = "";
        Integer speedDetector = null;
        String speedDetectorLabel = "";
        Integer sceneMode = null;
        String sceneModeLabel = "";
        Integer capType = null;
        String capTypeLabel = "";
        Integer capMode = null;
        String capModeLabel = "";
        Integer speedMode = null;
        String speedModeLabel = "";
        Integer radarType = null;
        String radarTypeLabel = "";
        Integer levelAngle = null;
        Integer radarSensitivity = null;
        Integer radarSpeedValidTime = null;
        Float lineCorrectParam = null;
        Integer constCorrectParam = null;
        Boolean plateRecogEnabled = null;
        Integer plateRecogMode = null;
        Boolean vehicleLogoRecogEnabled = null;
        Integer plateProvince = null;
        Integer plateRegion = null;
        Integer plateCountry = null;
        Integer platePixelWidthMin = null;
        Integer platePixelWidthMax = null;
        Boolean firstLaneEnabled = null;
        Integer firstLaneRelatedDriveWay = null;
        Integer firstLaneDistance = null;
        Integer firstLaneTrigDelayTime = null;
        Integer firstLaneTrigDelayDistance = null;
        Integer firstLaneIntervalType = null;
        Integer firstLaneInterval1 = null;
        Integer firstLaneInterval2 = null;
        Integer firstLaneInterval3 = null;
        Integer firstLaneInterval4 = null;
        Boolean firstLaneSpeedCapEnabled = null;
        Integer firstLaneSignSpeed = null;
        Integer firstLaneSpeedLimit = null;
        Integer firstLaneSnapTimes = null;
        Integer firstLaneOverlayDriveWay = null;
        Integer firstLaneFlashMode = null;
        Integer firstLaneCartSignSpeed = null;
        Integer firstLaneCartSpeedLimit = null;
        Integer firstLaneRelatedIOOutEx = null;
        Integer firstLaneLaneType = null;
        Integer firstLaneUseageType = null;
        Integer firstLaneDirectionType = null;
        Integer firstLaneLowSpeedLimit = null;
        Integer firstLaneBigCarLowSpeedLimit = null;
        Boolean firstLaneLowSpeedCapEnabled = null;
        Boolean firstLaneEmergencyCapEnabled = null;
        Integer firstLaneRegionMode = null;
        String firstLaneRegionPoints = "";
        Integer firstLaneRegionPointCount = null;
        Integer singleIoEnabledMask = null;
        Integer singleIoDefaultStatus = null;
        Integer singleIoIntervalType = null;
        Integer singleIoInterval1 = null;
        Integer singleIoInterval2 = null;
        Integer singleIoInterval3 = null;
        Integer singleIoInterval4 = null;
        Integer singleIoCopyMask = null;
        Integer epoliceTrafficLightSignalSrc = null;
        Integer epoliceSnapPicPreRecord = null;
        Integer epoliceSerialType = null;
        Integer epoliceSerialProtocol = null;
        Integer epoliceNormalPassProtocol = null;
        Integer epoliceInverseProtocol = null;
        Integer epoliceSpeedProtocol = null;
        Integer epoliceCopyProtocolMask = null;
        Integer epoliceCopyParamMask = null;

        if (triggerType == 0x4) {
            NET_ITC_POST_RS485_PARAM rs485 = trigger.uTriggerParam.asRs485();
            laneCount = unsignedByte(rs485.byRelatedLaneNum);
            triggerSpareMode = unsignedByte(rs485.byTriggerSpareMode);
            triggerSpareModeLabel = getTriggerSpareModeLabel(triggerSpareMode);
            faultToleranceMinutes = unsignedByte(rs485.byFaultToleranceTime);
            plateRecogEnabled = unsignedByte(rs485.struPlateRecog.byEnable) == 1;
            plateRecogMode = rs485.struPlateRecog.dwRecogMode;
            vehicleLogoRecogEnabled = unsignedByte(rs485.struPlateRecog.byVehicleLogoRecog) == 1;
            plateProvince = unsignedByte(rs485.struPlateRecog.byProvince);
            plateRegion = unsignedByte(rs485.struPlateRecog.byRegion);
            plateCountry = unsignedByte(rs485.struPlateRecog.byCountry);
            platePixelWidthMin = unsignedShort(rs485.struPlateRecog.wPlatePixelWidthMin);
            platePixelWidthMax = unsignedShort(rs485.struPlateRecog.wPlatePixelWidthMax);
            NET_ITC_LANE_PARAM firstLane = rs485.struLane[0];
            firstLaneEnabled = unsignedByte(firstLane.byEnable) == 1;
            firstLaneRelatedDriveWay = unsignedByte(firstLane.byRelatedDriveWay);
            firstLaneDistance = unsignedShort(firstLane.wDistance);
            firstLaneTrigDelayTime = unsignedShort(firstLane.wTrigDelayTime);
            firstLaneTrigDelayDistance = unsignedByte(firstLane.byTrigDelayDistance);
            firstLaneIntervalType = unsignedByte(firstLane.struInterval.byIntervalType);
            firstLaneInterval1 = unsignedShort(firstLane.struInterval.wInterval[0]);
            firstLaneInterval2 = unsignedShort(firstLane.struInterval.wInterval[1]);
            firstLaneInterval3 = unsignedShort(firstLane.struInterval.wInterval[2]);
            firstLaneInterval4 = unsignedShort(firstLane.struInterval.wInterval[3]);
            firstLaneSpeedCapEnabled = unsignedByte(firstLane.bySpeedCapEn) == 1;
            firstLaneSignSpeed = unsignedByte(firstLane.bySignSpeed);
            firstLaneSpeedLimit = unsignedByte(firstLane.bySpeedLimit);
            firstLaneSnapTimes = unsignedByte(firstLane.bySnapTimes);
            firstLaneOverlayDriveWay = unsignedByte(firstLane.byOverlayDriveWay);
            firstLaneFlashMode = unsignedByte(firstLane.byFlashMode);
            firstLaneCartSignSpeed = unsignedByte(firstLane.byCartSignSpeed);
            firstLaneCartSpeedLimit = unsignedByte(firstLane.byCartSpeedLimit);
            firstLaneRelatedIOOutEx = unsignedByte(firstLane.byRelatedIOOutEx);
            firstLaneLaneType = unsignedByte(firstLane.byLaneType);
            firstLaneUseageType = unsignedByte(firstLane.byUseageType);
            firstLaneDirectionType = unsignedByte(firstLane.byRelaLaneDirectionType);
            firstLaneLowSpeedLimit = unsignedByte(firstLane.byLowSpeedLimit);
            firstLaneBigCarLowSpeedLimit = unsignedByte(firstLane.byBigCarLowSpeedLimit);
            firstLaneLowSpeedCapEnabled = unsignedByte(firstLane.byLowSpeedCapEn) == 1;
            firstLaneEmergencyCapEnabled = unsignedByte(firstLane.byEmergencyCapEn) == 1;
            NET_ITC_PLATE_RECOG_REGION_PARAM firstLaneRegion = firstLane.struPlateRecog[0];
            firstLaneRegionMode = unsignedByte(firstLaneRegion.byMode);
            firstLaneRegionPoints = buildRegionPointsString(firstLaneRegion);
            firstLaneRegionPointCount = countRegionPoints(firstLaneRegionPoints);
            detailSource = "rs485";
        } else if (triggerType == 0x2) {
            NET_ITC_POST_SINGLEIO_PARAM singleIO = trigger.uTriggerParam.asSingleIO();
            NET_ITC_SINGLEIO_PARAM firstIO = singleIO.struSingleIO[0];
            laneCount = 1;
            int enabledMask = 0;
            for (int i = 0; i < Math.min(singleIO.struSingleIO.length, 7); i += 1) {
                if (unsignedByte(singleIO.struSingleIO[i].byEnable) == 1) enabledMask |= (1 << i);
            }
            singleIoEnabledMask = enabledMask;
            singleIoCopyMask = 1;
            singleIoDefaultStatus = unsignedByte(firstIO.byDefaultStatus);
            singleIoIntervalType = unsignedByte(firstIO.struInterval.byIntervalType);
            singleIoInterval1 = unsignedShort(firstIO.struInterval.wInterval[0]);
            singleIoInterval2 = unsignedShort(firstIO.struInterval.wInterval[1]);
            singleIoInterval3 = unsignedShort(firstIO.struInterval.wInterval[2]);
            singleIoInterval4 = unsignedShort(firstIO.struInterval.wInterval[3]);
            firstLaneEnabled = unsignedByte(firstIO.byEnable) == 1;
            firstLaneRelatedDriveWay = unsignedByte(firstIO.byRelatedDriveWay);
            firstLaneSnapTimes = unsignedByte(firstIO.bySnapTimes);
            firstLaneRelatedIOOutEx = unsignedByte(firstIO.byRelatedIOOutEx);
            firstLaneFlashMode = unsignedByte(firstIO.byFlashMode);
            firstLaneUseageType = unsignedByte(firstIO.byUseageType);
            firstLaneEmergencyCapEnabled = unsignedByte(firstIO.byEmergencyCapEn) == 1;
            firstLaneRegionMode = unsignedByte(firstIO.struPlateRecog[0].byMode);
            firstLaneRegionPoints = buildRegionPointsString(firstIO.struPlateRecog[0]);
            firstLaneRegionPointCount = countRegionPoints(firstLaneRegionPoints);
            detailSource = "singleIO";
        } else if (triggerType == 0x8) {
            NET_ITC_POST_RS485_RADAR_PARAM radar = trigger.uTriggerParam.asRadar();
            laneCount = unsignedByte(radar.byRelatedLaneNum);
            radarType = unsignedByte(radar.struRadar.byRadarType);
            radarTypeLabel = getRadarTypeLabel(radarType);
            levelAngle = unsignedByte(radar.struRadar.byLevelAngle);
            radarSensitivity = unsignedShort(radar.struRadar.wRadarSensitivity);
            radarSpeedValidTime = unsignedShort(radar.struRadar.wRadarSpeedValidTime);
            lineCorrectParam = radar.struRadar.fLineCorrectParam;
            constCorrectParam = radar.struRadar.iConstCorrectParam;
            plateRecogEnabled = unsignedByte(radar.struPlateRecog.byEnable) == 1;
            plateRecogMode = radar.struPlateRecog.dwRecogMode;
            vehicleLogoRecogEnabled = unsignedByte(radar.struPlateRecog.byVehicleLogoRecog) == 1;
            plateProvince = unsignedByte(radar.struPlateRecog.byProvince);
            plateRegion = unsignedByte(radar.struPlateRecog.byRegion);
            plateCountry = unsignedByte(radar.struPlateRecog.byCountry);
            platePixelWidthMin = unsignedShort(radar.struPlateRecog.wPlatePixelWidthMin);
            platePixelWidthMax = unsignedShort(radar.struPlateRecog.wPlatePixelWidthMax);
            NET_ITC_LANE_PARAM firstLane = radar.struLane[0];
            firstLaneEnabled = unsignedByte(firstLane.byEnable) == 1;
            firstLaneRelatedDriveWay = unsignedByte(firstLane.byRelatedDriveWay);
            firstLaneDistance = unsignedShort(firstLane.wDistance);
            firstLaneTrigDelayTime = unsignedShort(firstLane.wTrigDelayTime);
            firstLaneTrigDelayDistance = unsignedByte(firstLane.byTrigDelayDistance);
            firstLaneIntervalType = unsignedByte(firstLane.struInterval.byIntervalType);
            firstLaneInterval1 = unsignedShort(firstLane.struInterval.wInterval[0]);
            firstLaneInterval2 = unsignedShort(firstLane.struInterval.wInterval[1]);
            firstLaneInterval3 = unsignedShort(firstLane.struInterval.wInterval[2]);
            firstLaneInterval4 = unsignedShort(firstLane.struInterval.wInterval[3]);
            firstLaneSpeedCapEnabled = unsignedByte(firstLane.bySpeedCapEn) == 1;
            firstLaneSignSpeed = unsignedByte(firstLane.bySignSpeed);
            firstLaneSpeedLimit = unsignedByte(firstLane.bySpeedLimit);
            firstLaneSnapTimes = unsignedByte(firstLane.bySnapTimes);
            firstLaneOverlayDriveWay = unsignedByte(firstLane.byOverlayDriveWay);
            firstLaneFlashMode = unsignedByte(firstLane.byFlashMode);
            firstLaneCartSignSpeed = unsignedByte(firstLane.byCartSignSpeed);
            firstLaneCartSpeedLimit = unsignedByte(firstLane.byCartSpeedLimit);
            firstLaneRelatedIOOutEx = unsignedByte(firstLane.byRelatedIOOutEx);
            firstLaneLaneType = unsignedByte(firstLane.byLaneType);
            firstLaneUseageType = unsignedByte(firstLane.byUseageType);
            firstLaneDirectionType = unsignedByte(firstLane.byRelaLaneDirectionType);
            firstLaneLowSpeedLimit = unsignedByte(firstLane.byLowSpeedLimit);
            firstLaneBigCarLowSpeedLimit = unsignedByte(firstLane.byBigCarLowSpeedLimit);
            firstLaneLowSpeedCapEnabled = unsignedByte(firstLane.byLowSpeedCapEn) == 1;
            firstLaneEmergencyCapEnabled = unsignedByte(firstLane.byEmergencyCapEn) == 1;
            NET_ITC_PLATE_RECOG_REGION_PARAM firstLaneRegion = firstLane.struPlateRecog[0];
            firstLaneRegionMode = unsignedByte(firstLaneRegion.byMode);
            firstLaneRegionPoints = buildRegionPointsString(firstLaneRegion);
            firstLaneRegionPointCount = countRegionPoints(firstLaneRegionPoints);
            detailSource = "rs485Radar";
        } else if (triggerType == 0x10) {
            NET_ITC_POST_VTCOIL_PARAM vt = trigger.uTriggerParam.asVtCoil();
            laneCount = unsignedByte(vt.byRelatedLaneNum);
            displayEnabled = unsignedByte(vt.byIsDisplay) == 1;
            displayEnabledLabel = displayEnabled ? "Yes" : "No";
            snapMode = unsignedByte(vt.bySnapMode);
            snapModeLabel = getSnapModeLabel(snapMode);
            speedDetector = unsignedByte(vt.bySpeedDetector);
            speedDetectorLabel = getSpeedDetectorLabel(speedDetector);
            sceneMode = vt.dwSceneMode;
            sceneModeLabel = getSceneModeLabel(sceneMode);
            detailSource = "virtualCoil";
        } else if ((triggerType & 0x20) != 0 || (triggerType & 0x100000) != 0) {
            NET_ITC_POST_HVT_PARAM_V50 hvt = trigger.uTriggerParam.asHvtV50();
            laneCount = unsignedByte(hvt.byLaneNum);
            capType = unsignedByte(hvt.byCapType);
            capTypeLabel = getCapTypeLabel(capType);
            capMode = unsignedByte(hvt.byCapMode);
            capModeLabel = getCapModeLabel(capMode);
            sceneMode = unsignedByte(hvt.bySecneMode);
            sceneModeLabel = getSceneModeLabel(sceneMode);
            speedMode = unsignedByte(hvt.bySpeedMode);
            speedModeLabel = getSpeedModeLabel(speedMode);
            plateRecogEnabled = unsignedByte(hvt.struPlateRecog.byEnable) == 1;
            plateRecogMode = hvt.struPlateRecog.dwRecogMode;
            vehicleLogoRecogEnabled = unsignedByte(hvt.struPlateRecog.byVehicleLogoRecog) == 1;
            plateProvince = unsignedByte(hvt.struPlateRecog.byProvince);
            plateRegion = unsignedByte(hvt.struPlateRecog.byRegion);
            plateCountry = unsignedByte(hvt.struPlateRecog.byCountry);
            platePixelWidthMin = unsignedShort(hvt.struPlateRecog.wPlatePixelWidthMin);
            platePixelWidthMax = unsignedShort(hvt.struPlateRecog.wPlatePixelWidthMax);
            NET_ITC_LANE_HVT_PARAM_V50 firstLane = hvt.struLaneParam[0];
            firstLaneEnabled = true;
            firstLaneRelatedDriveWay = unsignedByte(firstLane.byRelatedDriveWay);
            firstLaneOverlayDriveWay = unsignedByte(firstLane.byLaneNO);
            firstLaneSignSpeed = unsignedByte(firstLane.bySignSpeed);
            firstLaneSpeedLimit = unsignedByte(firstLane.bySpeedLimit);
            firstLaneSnapTimes = unsignedByte(firstLane.bySnapTimes);
            firstLaneFlashMode = unsignedByte(firstLane.byFlashMode);
            firstLaneCartSignSpeed = unsignedByte(firstLane.byBigCarSignSpeed);
            firstLaneCartSpeedLimit = unsignedByte(firstLane.byBigCarSpeedLimit);
            firstLaneRelatedIOOutEx = firstLane.dwRelatedIOOut;
            firstLaneLaneType = unsignedByte(firstLane.byLaneType);
            firstLaneUseageType = unsignedByte(firstLane.struLane.byUseageType);
            firstLaneDirectionType = unsignedByte(firstLane.byRelaLaneDirectionType);
            firstLaneLowSpeedLimit = unsignedByte(firstLane.byLowSpeedLimit);
            firstLaneBigCarLowSpeedLimit = unsignedByte(firstLane.byBigCarLowSpeedLimit);
            firstLaneSpeedCapEnabled = (firstLane.dwVioDetectType & 0x800) != 0;
            firstLaneLowSpeedCapEnabled = (firstLane.dwVioDetectType & 0x1000) != 0;
            firstLaneEmergencyCapEnabled = (firstLane.dwVioDetectType & 0x2000) != 0;
            firstLaneIntervalType = unsignedByte(firstLane.struInterval.byIntervalType);
            firstLaneInterval1 = unsignedShort(firstLane.struInterval.wInterval[0]);
            firstLaneInterval2 = unsignedShort(firstLane.struInterval.wInterval[1]);
            firstLaneInterval3 = unsignedShort(firstLane.struInterval.wInterval[2]);
            firstLaneInterval4 = unsignedShort(firstLane.struInterval.wInterval[3]);
            detailSource = "hvtV50";
        } else if (triggerType == 0x200 || triggerType == 0x10000) {
            NET_ITC_EPOLICE_RS485_PARAM epolice = trigger.uTriggerParam.asEpoliceRs485();
            laneCount = unsignedByte(epolice.byRelatedLaneNum);
            epoliceTrafficLightSignalSrc = unsignedByte(epolice.byTrafficLightSignalSrc);
            plateRecogEnabled = unsignedByte(epolice.struPlateRecog.byEnable) == 1;
            plateRecogMode = epolice.struPlateRecog.dwRecogMode;
            vehicleLogoRecogEnabled = unsignedByte(epolice.struPlateRecog.byVehicleLogoRecog) == 1;
            plateProvince = unsignedByte(epolice.struPlateRecog.byProvince);
            plateRegion = unsignedByte(epolice.struPlateRecog.byRegion);
            plateCountry = unsignedByte(epolice.struPlateRecog.byCountry);
            platePixelWidthMin = unsignedShort(epolice.struPlateRecog.wPlatePixelWidthMin);
            platePixelWidthMax = unsignedShort(epolice.struPlateRecog.wPlatePixelWidthMax);
            NET_ITC_EPOLICE_LANE_PARAM firstLane = epolice.struLane[0];
            firstLaneEnabled = unsignedByte(firstLane.byEnable) == 1;
            firstLaneRelatedDriveWay = unsignedByte(firstLane.byRelatedDriveWay);
            firstLaneDistance = unsignedShort(firstLane.wDistance);
            firstLaneSignSpeed = unsignedByte(firstLane.bySignSpeed);
            firstLaneSpeedLimit = unsignedByte(firstLane.bySpeedLimit);
            firstLaneOverlayDriveWay = unsignedByte(firstLane.byOverlayDriveWay);
            firstLaneFlashMode = unsignedByte(firstLane.byFlashMode);
            firstLaneRelatedIOOutEx = unsignedByte(firstLane.byRelatedIOOutEx);
            firstLaneDirectionType = unsignedByte(firstLane.byRelaLaneDirectionType);
            firstLaneCartSignSpeed = unsignedByte(firstLane.byBigCarSignSpeed);
            firstLaneCartSpeedLimit = unsignedByte(firstLane.byBigCarSpeedLimit);
            firstLaneRegionMode = unsignedByte(firstLane.struPlateRecog[0].byMode);
            firstLaneRegionPoints = buildRegionPointsString(firstLane.struPlateRecog[0]);
            firstLaneRegionPointCount = countRegionPoints(firstLaneRegionPoints);
            firstLaneIntervalType = unsignedByte(firstLane.struSerialInfo.byIntervalType);
            firstLaneInterval1 = unsignedShort(firstLane.struSerialInfo.wInterval);
            epoliceSnapPicPreRecord = unsignedByte(firstLane.bySnapPicPreRecord);
            epoliceSerialType = unsignedByte(firstLane.bySerialType);
            epoliceSerialProtocol = unsignedByte(firstLane.struSerialInfo.bySerialProtocol);
            epoliceNormalPassProtocol = unsignedByte(firstLane.struSerialInfo.byNormalPassProtocol);
            epoliceInverseProtocol = unsignedByte(firstLane.struSerialInfo.byInverseProtocol);
            epoliceSpeedProtocol = unsignedByte(firstLane.struSerialInfo.bySpeedProtocol);
            epoliceCopyProtocolMask = 1;
            epoliceCopyParamMask = 1;
            detailSource = triggerType == 0x200 ? "epoliceRs485" : "perRs485";
        }

        StringBuilder summary = new StringBuilder();
        summary.append(enabled ? "Enabled" : "Disabled").append(" / ").append(triggerLabel);
        if (laneCount > 0) summary.append(" / lanes=").append(laneCount);
        if (!triggerSpareModeLabel.isEmpty()) summary.append(" / spare=").append(triggerSpareModeLabel);
        if (!capModeLabel.isEmpty()) summary.append(" / capMode=").append(capModeLabel);

        StringBuilder raw = new StringBuilder();
        raw.append("\"rawValues\":{");
        raw.append("\"triggerTypeCode\":").append(triggerType).append(",");
        raw.append("\"enabled\":").append(enabled ? 1 : 0).append(",");
        raw.append("\"laneCount\":").append(laneCount).append(",");
        raw.append("\"triggerSpareMode\":").append(triggerSpareMode == null ? "null" : triggerSpareMode).append(",");
        raw.append("\"faultToleranceMinutes\":").append(faultToleranceMinutes == null ? "null" : faultToleranceMinutes).append(",");
        raw.append("\"displayEnabled\":").append(displayEnabled == null ? "null" : (displayEnabled ? 1 : 0)).append(",");
        raw.append("\"snapMode\":").append(snapMode == null ? "null" : snapMode).append(",");
        raw.append("\"speedDetector\":").append(speedDetector == null ? "null" : speedDetector).append(",");
        raw.append("\"sceneMode\":").append(sceneMode == null ? "null" : sceneMode).append(",");
        raw.append("\"capType\":").append(capType == null ? "null" : capType).append(",");
        raw.append("\"capMode\":").append(capMode == null ? "null" : capMode).append(",");
        raw.append("\"speedMode\":").append(speedMode == null ? "null" : speedMode).append(",");
        raw.append("\"radarType\":").append(radarType == null ? "null" : radarType).append(",");
        raw.append("\"levelAngle\":").append(levelAngle == null ? "null" : levelAngle).append(",");
        raw.append("\"radarSensitivity\":").append(radarSensitivity == null ? "null" : radarSensitivity).append(",");
        raw.append("\"radarSpeedValidTime\":").append(radarSpeedValidTime == null ? "null" : radarSpeedValidTime).append(",");
        raw.append("\"lineCorrectParam\":").append(lineCorrectParam == null ? "null" : floatString(lineCorrectParam)).append(",");
        raw.append("\"constCorrectParam\":").append(constCorrectParam == null ? "null" : constCorrectParam).append(",");
        raw.append("\"plateRecogEnabled\":").append(plateRecogEnabled == null ? "null" : (plateRecogEnabled ? 1 : 0)).append(",");
        raw.append("\"plateRecogMode\":").append(plateRecogMode == null ? "null" : plateRecogMode).append(",");
        raw.append("\"vehicleLogoRecogEnabled\":").append(vehicleLogoRecogEnabled == null ? "null" : (vehicleLogoRecogEnabled ? 1 : 0)).append(",");
        raw.append("\"plateProvince\":").append(plateProvince == null ? "null" : plateProvince).append(",");
        raw.append("\"plateRegion\":").append(plateRegion == null ? "null" : plateRegion).append(",");
        raw.append("\"plateCountry\":").append(plateCountry == null ? "null" : plateCountry).append(",");
        raw.append("\"platePixelWidthMin\":").append(platePixelWidthMin == null ? "null" : platePixelWidthMin).append(",");
        raw.append("\"platePixelWidthMax\":").append(platePixelWidthMax == null ? "null" : platePixelWidthMax).append(",");
        raw.append("\"firstLaneEnabled\":").append(firstLaneEnabled == null ? "null" : (firstLaneEnabled ? 1 : 0)).append(",");
        raw.append("\"firstLaneRelatedDriveWay\":").append(firstLaneRelatedDriveWay == null ? "null" : firstLaneRelatedDriveWay).append(",");
        raw.append("\"firstLaneDistance\":").append(firstLaneDistance == null ? "null" : firstLaneDistance).append(",");
        raw.append("\"firstLaneTrigDelayTime\":").append(firstLaneTrigDelayTime == null ? "null" : firstLaneTrigDelayTime).append(",");
        raw.append("\"firstLaneTrigDelayDistance\":").append(firstLaneTrigDelayDistance == null ? "null" : firstLaneTrigDelayDistance).append(",");
        raw.append("\"firstLaneIntervalType\":").append(firstLaneIntervalType == null ? "null" : firstLaneIntervalType).append(",");
        raw.append("\"firstLaneInterval1\":").append(firstLaneInterval1 == null ? "null" : firstLaneInterval1).append(",");
        raw.append("\"firstLaneInterval2\":").append(firstLaneInterval2 == null ? "null" : firstLaneInterval2).append(",");
        raw.append("\"firstLaneInterval3\":").append(firstLaneInterval3 == null ? "null" : firstLaneInterval3).append(",");
        raw.append("\"firstLaneInterval4\":").append(firstLaneInterval4 == null ? "null" : firstLaneInterval4).append(",");
        raw.append("\"firstLaneSpeedCapEnabled\":").append(firstLaneSpeedCapEnabled == null ? "null" : (firstLaneSpeedCapEnabled ? 1 : 0)).append(",");
        raw.append("\"firstLaneSignSpeed\":").append(firstLaneSignSpeed == null ? "null" : firstLaneSignSpeed).append(",");
        raw.append("\"firstLaneSpeedLimit\":").append(firstLaneSpeedLimit == null ? "null" : firstLaneSpeedLimit).append(",");
        raw.append("\"firstLaneSnapTimes\":").append(firstLaneSnapTimes == null ? "null" : firstLaneSnapTimes).append(",");
        raw.append("\"firstLaneOverlayDriveWay\":").append(firstLaneOverlayDriveWay == null ? "null" : firstLaneOverlayDriveWay).append(",");
        raw.append("\"firstLaneFlashMode\":").append(firstLaneFlashMode == null ? "null" : firstLaneFlashMode).append(",");
        raw.append("\"firstLaneCartSignSpeed\":").append(firstLaneCartSignSpeed == null ? "null" : firstLaneCartSignSpeed).append(",");
        raw.append("\"firstLaneCartSpeedLimit\":").append(firstLaneCartSpeedLimit == null ? "null" : firstLaneCartSpeedLimit).append(",");
        raw.append("\"firstLaneRelatedIOOutEx\":").append(firstLaneRelatedIOOutEx == null ? "null" : firstLaneRelatedIOOutEx).append(",");
        raw.append("\"firstLaneLaneType\":").append(firstLaneLaneType == null ? "null" : firstLaneLaneType).append(",");
        raw.append("\"firstLaneUseageType\":").append(firstLaneUseageType == null ? "null" : firstLaneUseageType).append(",");
        raw.append("\"firstLaneDirectionType\":").append(firstLaneDirectionType == null ? "null" : firstLaneDirectionType).append(",");
        raw.append("\"firstLaneLowSpeedLimit\":").append(firstLaneLowSpeedLimit == null ? "null" : firstLaneLowSpeedLimit).append(",");
        raw.append("\"firstLaneBigCarLowSpeedLimit\":").append(firstLaneBigCarLowSpeedLimit == null ? "null" : firstLaneBigCarLowSpeedLimit).append(",");
        raw.append("\"firstLaneLowSpeedCapEnabled\":").append(firstLaneLowSpeedCapEnabled == null ? "null" : (firstLaneLowSpeedCapEnabled ? 1 : 0)).append(",");
        raw.append("\"firstLaneEmergencyCapEnabled\":").append(firstLaneEmergencyCapEnabled == null ? "null" : (firstLaneEmergencyCapEnabled ? 1 : 0)).append(",");
        raw.append("\"firstLaneRegionMode\":").append(firstLaneRegionMode == null ? "null" : firstLaneRegionMode).append(",");
        raw.append("\"singleIoEnabledMask\":").append(singleIoEnabledMask == null ? "null" : singleIoEnabledMask).append(",");
        raw.append("\"singleIoDefaultStatus\":").append(singleIoDefaultStatus == null ? "null" : singleIoDefaultStatus).append(",");
        raw.append("\"singleIoIntervalType\":").append(singleIoIntervalType == null ? "null" : singleIoIntervalType).append(",");
        raw.append("\"singleIoInterval1\":").append(singleIoInterval1 == null ? "null" : singleIoInterval1).append(",");
        raw.append("\"singleIoInterval2\":").append(singleIoInterval2 == null ? "null" : singleIoInterval2).append(",");
        raw.append("\"singleIoInterval3\":").append(singleIoInterval3 == null ? "null" : singleIoInterval3).append(",");
        raw.append("\"singleIoInterval4\":").append(singleIoInterval4 == null ? "null" : singleIoInterval4).append(",");
        raw.append("\"singleIoCopyMask\":").append(singleIoCopyMask == null ? "null" : singleIoCopyMask).append(",");
        raw.append("\"epoliceTrafficLightSignalSrc\":").append(epoliceTrafficLightSignalSrc == null ? "null" : epoliceTrafficLightSignalSrc).append(",");
        raw.append("\"epoliceSnapPicPreRecord\":").append(epoliceSnapPicPreRecord == null ? "null" : epoliceSnapPicPreRecord).append(",");
        raw.append("\"epoliceSerialType\":").append(epoliceSerialType == null ? "null" : epoliceSerialType).append(",");
        raw.append("\"epoliceSerialProtocol\":").append(epoliceSerialProtocol == null ? "null" : epoliceSerialProtocol).append(",");
        raw.append("\"epoliceNormalPassProtocol\":").append(epoliceNormalPassProtocol == null ? "null" : epoliceNormalPassProtocol).append(",");
        raw.append("\"epoliceInverseProtocol\":").append(epoliceInverseProtocol == null ? "null" : epoliceInverseProtocol).append(",");
        raw.append("\"epoliceSpeedProtocol\":").append(epoliceSpeedProtocol == null ? "null" : epoliceSpeedProtocol).append(",");
        raw.append("\"epoliceCopyProtocolMask\":").append(epoliceCopyProtocolMask == null ? "null" : epoliceCopyProtocolMask).append(",");
        raw.append("\"epoliceCopyParamMask\":").append(epoliceCopyParamMask == null ? "null" : epoliceCopyParamMask);
        raw.append("},");

        return "{"
                + "\"success\":true,"
                + "\"message\":\"SDK trigger config loaded\","
                + "\"triggerConfig\":{"
                + raw.toString()
                + "\"enabled\":" + enabled + ","
                + "\"enabledLabel\":\"" + json(enabled ? "Enabled" : "Disabled") + "\","
                + "\"triggerTypeCode\":" + triggerType + ","
                + "\"triggerTypeHex\":\"" + json(toHex(triggerType)) + "\","
                + "\"triggerTypeLabel\":\"" + json(triggerLabel) + "\","
                + "\"detailSource\":\"" + json(detailSource) + "\","
                + "\"laneCount\":" + laneCount + ","
                + "\"triggerSpareMode\":" + (triggerSpareMode == null ? "null" : triggerSpareMode) + ","
                + "\"triggerSpareModeLabel\":\"" + json(triggerSpareModeLabel) + "\","
                + "\"faultToleranceMinutes\":" + (faultToleranceMinutes == null ? "null" : faultToleranceMinutes) + ","
                + "\"displayEnabled\":" + (displayEnabled == null ? "null" : displayEnabled) + ","
                + "\"displayEnabledLabel\":\"" + json(displayEnabledLabel) + "\","
                + "\"snapMode\":" + (snapMode == null ? "null" : snapMode) + ","
                + "\"snapModeLabel\":\"" + json(snapModeLabel) + "\","
                + "\"speedDetector\":" + (speedDetector == null ? "null" : speedDetector) + ","
                + "\"speedDetectorLabel\":\"" + json(speedDetectorLabel) + "\","
                + "\"sceneMode\":" + (sceneMode == null ? "null" : sceneMode) + ","
                + "\"sceneModeLabel\":\"" + json(sceneModeLabel) + "\","
                + "\"capType\":" + (capType == null ? "null" : capType) + ","
                + "\"capTypeLabel\":\"" + json(capTypeLabel) + "\","
                + "\"capMode\":" + (capMode == null ? "null" : capMode) + ","
                + "\"capModeLabel\":\"" + json(capModeLabel) + "\","
                + "\"speedMode\":" + (speedMode == null ? "null" : speedMode) + ","
                + "\"speedModeLabel\":\"" + json(speedModeLabel) + "\","
                + "\"radarType\":" + (radarType == null ? "null" : radarType) + ","
                + "\"radarTypeLabel\":\"" + json(radarTypeLabel) + "\","
                + "\"levelAngle\":" + (levelAngle == null ? "null" : levelAngle) + ","
                + "\"radarSensitivity\":" + (radarSensitivity == null ? "null" : radarSensitivity) + ","
                + "\"radarSpeedValidTime\":" + (radarSpeedValidTime == null ? "null" : radarSpeedValidTime) + ","
                + "\"lineCorrectParam\":" + (lineCorrectParam == null ? "null" : floatString(lineCorrectParam)) + ","
                + "\"constCorrectParam\":" + (constCorrectParam == null ? "null" : constCorrectParam) + ","
                + "\"plateRecogEnabled\":" + (plateRecogEnabled == null ? "null" : plateRecogEnabled) + ","
                + "\"plateRecogEnabledLabel\":\"" + json(boolNullableLabel(plateRecogEnabled)) + "\","
                + "\"plateRecogMode\":" + (plateRecogMode == null ? "null" : plateRecogMode) + ","
                + "\"vehicleLogoRecogEnabled\":" + (vehicleLogoRecogEnabled == null ? "null" : vehicleLogoRecogEnabled) + ","
                + "\"vehicleLogoRecogEnabledLabel\":\"" + json(boolNullableLabel(vehicleLogoRecogEnabled)) + "\","
                + "\"plateProvince\":" + (plateProvince == null ? "null" : plateProvince) + ","
                + "\"plateRegion\":" + (plateRegion == null ? "null" : plateRegion) + ","
                + "\"plateCountry\":" + (plateCountry == null ? "null" : plateCountry) + ","
                + "\"platePixelWidthMin\":" + (platePixelWidthMin == null ? "null" : platePixelWidthMin) + ","
                + "\"platePixelWidthMax\":" + (platePixelWidthMax == null ? "null" : platePixelWidthMax) + ","
                + "\"firstLaneEnabled\":" + (firstLaneEnabled == null ? "null" : firstLaneEnabled) + ","
                + "\"firstLaneEnabledLabel\":\"" + json(boolNullableLabel(firstLaneEnabled)) + "\","
                + "\"firstLaneRelatedDriveWay\":" + (firstLaneRelatedDriveWay == null ? "null" : firstLaneRelatedDriveWay) + ","
                + "\"firstLaneDistance\":" + (firstLaneDistance == null ? "null" : firstLaneDistance) + ","
                + "\"firstLaneTrigDelayTime\":" + (firstLaneTrigDelayTime == null ? "null" : firstLaneTrigDelayTime) + ","
                + "\"firstLaneTrigDelayDistance\":" + (firstLaneTrigDelayDistance == null ? "null" : firstLaneTrigDelayDistance) + ","
                + "\"firstLaneIntervalType\":" + (firstLaneIntervalType == null ? "null" : firstLaneIntervalType) + ","
                + "\"firstLaneInterval1\":" + (firstLaneInterval1 == null ? "null" : firstLaneInterval1) + ","
                + "\"firstLaneInterval2\":" + (firstLaneInterval2 == null ? "null" : firstLaneInterval2) + ","
                + "\"firstLaneInterval3\":" + (firstLaneInterval3 == null ? "null" : firstLaneInterval3) + ","
                + "\"firstLaneInterval4\":" + (firstLaneInterval4 == null ? "null" : firstLaneInterval4) + ","
                + "\"firstLaneSpeedCapEnabled\":" + (firstLaneSpeedCapEnabled == null ? "null" : firstLaneSpeedCapEnabled) + ","
                + "\"firstLaneSpeedCapEnabledLabel\":\"" + json(boolNullableLabel(firstLaneSpeedCapEnabled)) + "\","
                + "\"firstLaneSignSpeed\":" + (firstLaneSignSpeed == null ? "null" : firstLaneSignSpeed) + ","
                + "\"firstLaneSpeedLimit\":" + (firstLaneSpeedLimit == null ? "null" : firstLaneSpeedLimit) + ","
                + "\"firstLaneSnapTimes\":" + (firstLaneSnapTimes == null ? "null" : firstLaneSnapTimes) + ","
                + "\"firstLaneOverlayDriveWay\":" + (firstLaneOverlayDriveWay == null ? "null" : firstLaneOverlayDriveWay) + ","
                + "\"firstLaneFlashMode\":" + (firstLaneFlashMode == null ? "null" : firstLaneFlashMode) + ","
                + "\"firstLaneCartSignSpeed\":" + (firstLaneCartSignSpeed == null ? "null" : firstLaneCartSignSpeed) + ","
                + "\"firstLaneCartSpeedLimit\":" + (firstLaneCartSpeedLimit == null ? "null" : firstLaneCartSpeedLimit) + ","
                + "\"firstLaneRelatedIOOutEx\":" + (firstLaneRelatedIOOutEx == null ? "null" : firstLaneRelatedIOOutEx) + ","
                + "\"firstLaneLaneType\":" + (firstLaneLaneType == null ? "null" : firstLaneLaneType) + ","
                + "\"firstLaneUseageType\":" + (firstLaneUseageType == null ? "null" : firstLaneUseageType) + ","
                + "\"firstLaneDirectionType\":" + (firstLaneDirectionType == null ? "null" : firstLaneDirectionType) + ","
                + "\"firstLaneLowSpeedLimit\":" + (firstLaneLowSpeedLimit == null ? "null" : firstLaneLowSpeedLimit) + ","
                + "\"firstLaneBigCarLowSpeedLimit\":" + (firstLaneBigCarLowSpeedLimit == null ? "null" : firstLaneBigCarLowSpeedLimit) + ","
                + "\"firstLaneLowSpeedCapEnabled\":" + (firstLaneLowSpeedCapEnabled == null ? "null" : firstLaneLowSpeedCapEnabled) + ","
                + "\"firstLaneLowSpeedCapEnabledLabel\":\"" + json(boolNullableLabel(firstLaneLowSpeedCapEnabled)) + "\","
                + "\"firstLaneEmergencyCapEnabled\":" + (firstLaneEmergencyCapEnabled == null ? "null" : firstLaneEmergencyCapEnabled) + ","
                + "\"firstLaneEmergencyCapEnabledLabel\":\"" + json(boolNullableLabel(firstLaneEmergencyCapEnabled)) + "\","
                + "\"firstLaneRegionMode\":" + (firstLaneRegionMode == null ? "null" : firstLaneRegionMode) + ","
                + "\"firstLaneRegionPoints\":\"" + json(firstLaneRegionPoints) + "\","
                + "\"firstLaneRegionPointCount\":" + (firstLaneRegionPointCount == null ? "null" : firstLaneRegionPointCount) + ","
                + "\"singleIoEnabledMask\":" + (singleIoEnabledMask == null ? "null" : singleIoEnabledMask) + ","
                + "\"singleIoDefaultStatus\":" + (singleIoDefaultStatus == null ? "null" : singleIoDefaultStatus) + ","
                + "\"singleIoIntervalType\":" + (singleIoIntervalType == null ? "null" : singleIoIntervalType) + ","
                + "\"singleIoInterval1\":" + (singleIoInterval1 == null ? "null" : singleIoInterval1) + ","
                + "\"singleIoInterval2\":" + (singleIoInterval2 == null ? "null" : singleIoInterval2) + ","
                + "\"singleIoInterval3\":" + (singleIoInterval3 == null ? "null" : singleIoInterval3) + ","
                + "\"singleIoInterval4\":" + (singleIoInterval4 == null ? "null" : singleIoInterval4) + ","
                + "\"singleIoCopyMask\":" + (singleIoCopyMask == null ? "null" : singleIoCopyMask) + ","
                + "\"epoliceTrafficLightSignalSrc\":" + (epoliceTrafficLightSignalSrc == null ? "null" : epoliceTrafficLightSignalSrc) + ","
                + "\"epoliceSnapPicPreRecord\":" + (epoliceSnapPicPreRecord == null ? "null" : epoliceSnapPicPreRecord) + ","
                + "\"epoliceSerialType\":" + (epoliceSerialType == null ? "null" : epoliceSerialType) + ","
                + "\"epoliceSerialProtocol\":" + (epoliceSerialProtocol == null ? "null" : epoliceSerialProtocol) + ","
                + "\"epoliceNormalPassProtocol\":" + (epoliceNormalPassProtocol == null ? "null" : epoliceNormalPassProtocol) + ","
                + "\"epoliceInverseProtocol\":" + (epoliceInverseProtocol == null ? "null" : epoliceInverseProtocol) + ","
                + "\"epoliceSpeedProtocol\":" + (epoliceSpeedProtocol == null ? "null" : epoliceSpeedProtocol) + ","
                + "\"epoliceCopyProtocolMask\":" + (epoliceCopyProtocolMask == null ? "null" : epoliceCopyProtocolMask) + ","
                + "\"epoliceCopyParamMask\":" + (epoliceCopyParamMask == null ? "null" : epoliceCopyParamMask) + ","
                + "\"summary\":\"" + json(summary.toString()) + "\""
                + "}"
                + "}";
    }

    private static String buildVideoEpoliceTriggerConfig(int userId) {
        NET_ITC_VIDEO_TRIGGER_PARAM config = loadVideoTriggerConfigStruct(userId, 0x20000);
        if (config == null) {
            return "{"
                    + "\"success\":true,"
                    + "\"message\":\"SDK video ePolice trigger config loaded (empty)\","
                    + "\"sdkAvailable\":true,"
                    + "\"triggerConfig\":{\"enabled\":true,\"triggerTypeCode\":131072,\"triggerTypeHex\":\"0x20000\",\"triggerTypeLabel\":\"Video ePolice\",\"summary\":\"Video ePolice\"}"
                    + "}";
        }
        NET_ITC_VIDEO_EPOLICE_PARAM video = config.uVideoTrigger.asVideoEpolice();
        NET_ITC_LANE_VIDEO_EPOLICE_PARAM lane = video.struLaneParam[0];
        NET_ITC_VIOLATION_DETECT_PARAM vio = lane.struVioDetect;
        int vioType = vio.dwVioDetectType;
        int laneCount = defaultPositive(unsignedByte(video.byLaneNum), 1);
        String summary = "Enabled / Video ePolice / lanes=" + laneCount;
        return "{"
                + "\"success\":true,"
                + "\"message\":\"SDK video ePolice trigger config loaded\","
                + "\"sdkAvailable\":true,"
                + "\"triggerConfig\":{"
                + "\"enabled\":" + (unsignedByte(video.byEnable) == 1) + ","
                + "\"enabledLabel\":\"" + json(boolNullableLabel(unsignedByte(video.byEnable) == 1)) + "\","
                + "\"triggerTypeCode\":131072,"
                + "\"triggerTypeHex\":\"0x20000\","
                + "\"triggerTypeLabel\":\"Video ePolice\","
                + "\"detailSource\":\"videoEpolice\","
                + "\"laneCount\":" + laneCount + ","
                + "\"firstLaneRelatedDriveWay\":" + defaultPositive(unsignedByte(lane.byLaneNO), 1) + ","
                + "\"firstLaneDirectionType\":" + unsignedByte(lane.byRelaLaneDirectionType) + ","
                + "\"firstLaneUseageType\":" + unsignedByte(lane.struLane.byUseageType) + ","
                + "\"videoEpoliceCarDriveDirect\":" + unsignedByte(lane.struLane.byCarDriveDirect) + ","
                + "\"firstLaneSpeedLimit\":" + unsignedByte(lane.byCarSpeedLimit) + ","
                + "\"firstLaneSignSpeed\":" + unsignedByte(lane.byCarSignSpeed) + ","
                + "\"epoliceSnapPicPreRecord\":" + unsignedByte(lane.bySnapPicPreRecord) + ","
                + "\"videoEpoliceIntervalType\":" + unsignedByte(lane.struInterval.byIntervalType) + ","
                + "\"videoEpoliceIntervalMs\":" + unsignedShort(lane.struInterval.wInterval[0]) + ","
                + "\"videoEpoliceCheckpointEnabled\":" + ((vioType & 0x01) != 0) + ","
                + "\"videoEpoliceCheckpointLevel\":" + defaultPositive(unsignedByte(vio.byPostSnapTimes), 1) + ","
                + "\"videoEpoliceWrongDirectionEnabled\":" + ((vioType & 0x10) != 0) + ","
                + "\"videoEpoliceIllegalUTurnEnabled\":" + ((vioType & 0x8000) != 0) + ","
                + "\"videoEpoliceIllegalUTurnLevel\":" + defaultPositive(unsignedByte(vio.byTurnAroundEnable), 1) + ","
                + "\"videoEpoliceIllegalLaneChangeEnabled\":" + ((vioType & 0x80) != 0) + ","
                + "\"videoEpoliceIllegalLaneChangeLevel\":" + defaultPositive(unsignedByte(vio.byChangeLaneTimes), 1) + ","
                + "\"videoEpoliceReverseEnabled\":" + ((vioType & 0x04) != 0) + ","
                + "\"videoEpoliceReverseLevel\":" + defaultPositive(unsignedByte(vio.byReverseSnapTimes), 1) + ","
                + "\"videoEpoliceLaneLineEnabled\":" + ((vioType & 0x02) != 0) + ","
                + "\"videoEpoliceLaneLineLevel\":" + defaultPositive(unsignedByte(vio.byDriveLineSnapTimes), 1) + ","
                + "\"videoEpoliceLaneLineSensitivity\":" + unsignedByte(vio.byDriveLineSnapSen) + ","
                + "\"videoEpoliceMotorOccupyNonMotorEnabled\":" + ((vioType & 0x40) != 0) + ","
                + "\"videoEpoliceMotorOccupyNonMotorLevel\":" + defaultPositive(unsignedByte(vio.byNonDriveSnapTimes), 1) + ","
                + "\"videoEpoliceStopSeconds\":" + unsignedShort(vio.wStayTime) + ","
                + "\"videoEpoliceIntersectionStopEnabled\":" + ((vioType & 0x200) != 0) + ","
                + "\"videoEpoliceGreenLightStopEnabled\":" + ((vioType & 0x400) != 0) + ","
                + "\"videoEpoliceProhibitionSignEnabled\":" + ((vioType & 0x100) != 0) + ","
                + "\"videoEpoliceProhibitionSignLevel\":" + defaultPositive(unsignedByte(vio.bybanTimes), 1) + ","
                + "\"videoEpoliceSpeedingEnabled\":" + ((vioType & 0x800) != 0) + ","
                + "\"videoEpoliceSpeedingLevel\":" + defaultPositive(unsignedByte(vio.bySpeedTimes), 1) + ","
                + "\"videoEpoliceRedLightEnabled\":" + ((vioType & 0x08) != 0) + ","
                + "\"videoEpoliceTrafficLightDetect\":" + unsignedByte(video.struTrafficLight.bySource) + ","
                + "\"videoEpoliceCopyParamMask\":1,"
                + "\"summary\":\"" + json(summary) + "\""
                + "}}";
    }

    private static String applyTriggerConfig(int userId, String[] args) {
        int requestedType = parseInt(arg(args, 6, "0"), 0);
        if (requestedType == 0x20000) {
            return applyVideoEpoliceTriggerConfig(userId, args);
        }
        NET_DVR_CURTRIGGERMODE currentMode = loadCurrentTriggerModeStruct(userId);
        int currentTriggerType = currentMode == null ? 0 : currentMode.dwTriggerType;
        NET_ITC_TRIGGERCFG config = loadTriggerConfigStruct(userId, currentTriggerType);
        if (config == null) {
            config = new NET_ITC_TRIGGERCFG();
            config.dwSize = config.size();
        }

        NET_ITC_SINGLE_TRIGGERCFG trigger = config.struTriggerParam;
        int originalType = trigger.dwTriggerType;
        trigger.byEnable = (byte) (parseBooleanFlag(arg(args, 5, unsignedByte(trigger.byEnable) == 1 ? "1" : "0")) ? 1 : 0);
        int nextType = parseInt(arg(args, 6, String.valueOf(trigger.dwTriggerType)), trigger.dwTriggerType);
        trigger.dwTriggerType = nextType;

        if (nextType == 0x2) {
            NET_ITC_POST_SINGLEIO_PARAM singleIO = (nextType == originalType) ? trigger.uTriggerParam.asSingleIO() : new NET_ITC_POST_SINGLEIO_PARAM();
            NET_ITC_SINGLEIO_PARAM firstIO = singleIO.struSingleIO[0];
            int enabledMask = parseInt(arg(args, 54, unsignedByte(firstIO.byEnable) == 1 ? "1" : "0"), unsignedByte(firstIO.byEnable) == 1 ? 1 : 0);
            int copyMask = parseInt(arg(args, 61, "1"), 1) | 1;
            firstIO.byEnable = (byte) ((enabledMask & 0x1) != 0 ? 1 : 0);
            firstIO.byDefaultStatus = (byte) parseInt(arg(args, 55, String.valueOf(unsignedByte(firstIO.byDefaultStatus))), unsignedByte(firstIO.byDefaultStatus));
            firstIO.byRelatedDriveWay = (byte) parseInt(arg(args, 32, String.valueOf(defaultPositive(unsignedByte(firstIO.byRelatedDriveWay), 1))), defaultPositive(unsignedByte(firstIO.byRelatedDriveWay), 1));
            firstIO.bySnapTimes = (byte) parseInt(arg(args, 39, String.valueOf(defaultPositive(unsignedByte(firstIO.bySnapTimes), 1))), defaultPositive(unsignedByte(firstIO.bySnapTimes), 1));
            firstIO.struInterval.byIntervalType = (byte) parseInt(arg(args, 56, String.valueOf(unsignedByte(firstIO.struInterval.byIntervalType))), unsignedByte(firstIO.struInterval.byIntervalType));
            firstIO.struInterval.wInterval[0] = (short) parseInt(arg(args, 57, String.valueOf(unsignedShort(firstIO.struInterval.wInterval[0]))), unsignedShort(firstIO.struInterval.wInterval[0]));
            firstIO.struInterval.wInterval[1] = (short) parseInt(arg(args, 58, String.valueOf(unsignedShort(firstIO.struInterval.wInterval[1]))), unsignedShort(firstIO.struInterval.wInterval[1]));
            firstIO.struInterval.wInterval[2] = (short) parseInt(arg(args, 59, String.valueOf(unsignedShort(firstIO.struInterval.wInterval[2]))), unsignedShort(firstIO.struInterval.wInterval[2]));
            firstIO.struInterval.wInterval[3] = (short) parseInt(arg(args, 60, String.valueOf(unsignedShort(firstIO.struInterval.wInterval[3]))), unsignedShort(firstIO.struInterval.wInterval[3]));
            firstIO.byRelatedIOOutEx = (byte) parseInt(arg(args, 44, String.valueOf(unsignedByte(firstIO.byRelatedIOOutEx))), unsignedByte(firstIO.byRelatedIOOutEx));
            firstIO.byFlashMode = (byte) parseInt(arg(args, 41, String.valueOf(unsignedByte(firstIO.byFlashMode))), unsignedByte(firstIO.byFlashMode));
            firstIO.byUseageType = (byte) parseInt(arg(args, 46, String.valueOf(unsignedByte(firstIO.byUseageType))), unsignedByte(firstIO.byUseageType));
            firstIO.byEmergencyCapEn = (byte) (parseBooleanFlag(arg(args, 51, unsignedByte(firstIO.byEmergencyCapEn) == 1 ? "1" : "0")) ? 1 : 0);
            firstIO.struInterval.write();
            applyPlateRecogRegion(firstIO.struPlateRecog[0], arg(args, 52, String.valueOf(unsignedByte(firstIO.struPlateRecog[0].byMode))), arg(args, 53, buildRegionPointsString(firstIO.struPlateRecog[0])));
            firstIO.write();
            singleIO.struSingleIO[0] = firstIO;
            for (int i = 1; i < Math.min(singleIO.struSingleIO.length, 7); i += 1) {
                NET_ITC_SINGLEIO_PARAM item = singleIO.struSingleIO[i];
                if (i < 4 && (copyMask & (1 << i)) != 0) {
                    copySingleIoParams(firstIO, item);
                }
                item.byEnable = (byte) ((enabledMask & (1 << i)) != 0 ? 1 : 0);
                item.write();
                singleIO.struSingleIO[i] = item;
            }

            singleIO.struPlateRecog.write();
            singleIO.write();
            writeStructureToUnion(trigger.uTriggerParam, singleIO);
        } else if (nextType == 0x4) {
            NET_ITC_POST_RS485_PARAM rs485 = (nextType == originalType) ? trigger.uTriggerParam.asRs485() : new NET_ITC_POST_RS485_PARAM();
            rs485.byRelatedLaneNum = (byte) parseInt(arg(args, 7, String.valueOf(unsignedByte(rs485.byRelatedLaneNum))), unsignedByte(rs485.byRelatedLaneNum));
            rs485.byTriggerSpareMode = (byte) parseInt(arg(args, 8, String.valueOf(unsignedByte(rs485.byTriggerSpareMode))), unsignedByte(rs485.byTriggerSpareMode));
            rs485.byFaultToleranceTime = (byte) parseInt(arg(args, 9, String.valueOf(unsignedByte(rs485.byFaultToleranceTime))), unsignedByte(rs485.byFaultToleranceTime));
            rs485.struPlateRecog.byEnable = (byte) (parseBooleanFlag(arg(args, 23, unsignedByte(rs485.struPlateRecog.byEnable) == 1 ? "1" : "0")) ? 1 : 0);
            rs485.struPlateRecog.dwRecogMode = parseInt(arg(args, 24, String.valueOf(rs485.struPlateRecog.dwRecogMode)), rs485.struPlateRecog.dwRecogMode);
            rs485.struPlateRecog.byVehicleLogoRecog = (byte) (parseBooleanFlag(arg(args, 25, unsignedByte(rs485.struPlateRecog.byVehicleLogoRecog) == 1 ? "1" : "0")) ? 1 : 0);
            rs485.struPlateRecog.byProvince = (byte) parseInt(arg(args, 26, String.valueOf(unsignedByte(rs485.struPlateRecog.byProvince))), unsignedByte(rs485.struPlateRecog.byProvince));
            rs485.struPlateRecog.byRegion = (byte) parseInt(arg(args, 27, String.valueOf(unsignedByte(rs485.struPlateRecog.byRegion))), unsignedByte(rs485.struPlateRecog.byRegion));
            rs485.struPlateRecog.byCountry = (byte) parseInt(arg(args, 28, String.valueOf(unsignedByte(rs485.struPlateRecog.byCountry))), unsignedByte(rs485.struPlateRecog.byCountry));
            rs485.struPlateRecog.wPlatePixelWidthMin = (short) parseInt(arg(args, 29, String.valueOf(unsignedShort(rs485.struPlateRecog.wPlatePixelWidthMin))), unsignedShort(rs485.struPlateRecog.wPlatePixelWidthMin));
            rs485.struPlateRecog.wPlatePixelWidthMax = (short) parseInt(arg(args, 30, String.valueOf(unsignedShort(rs485.struPlateRecog.wPlatePixelWidthMax))), unsignedShort(rs485.struPlateRecog.wPlatePixelWidthMax));

            NET_ITC_LANE_PARAM firstLane = rs485.struLane[0];
            firstLane.byEnable = (byte) (parseBooleanFlag(arg(args, 31, unsignedByte(firstLane.byEnable) == 1 ? "1" : "0")) ? 1 : 0);
            firstLane.byRelatedDriveWay = (byte) parseInt(arg(args, 32, String.valueOf(unsignedByte(firstLane.byRelatedDriveWay))), unsignedByte(firstLane.byRelatedDriveWay));
            firstLane.wDistance = (short) parseInt(arg(args, 33, String.valueOf(unsignedShort(firstLane.wDistance))), unsignedShort(firstLane.wDistance));
            firstLane.wTrigDelayTime = (short) parseInt(arg(args, 34, String.valueOf(unsignedShort(firstLane.wTrigDelayTime))), unsignedShort(firstLane.wTrigDelayTime));
            firstLane.byTrigDelayDistance = (byte) parseInt(arg(args, 35, String.valueOf(unsignedByte(firstLane.byTrigDelayDistance))), unsignedByte(firstLane.byTrigDelayDistance));
            firstLane.struInterval.byIntervalType = (byte) parseInt(arg(args, 62, String.valueOf(unsignedByte(firstLane.struInterval.byIntervalType))), unsignedByte(firstLane.struInterval.byIntervalType));
            firstLane.struInterval.wInterval[0] = (short) parseInt(arg(args, 63, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[0]))), unsignedShort(firstLane.struInterval.wInterval[0]));
            firstLane.struInterval.wInterval[1] = (short) parseInt(arg(args, 64, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[1]))), unsignedShort(firstLane.struInterval.wInterval[1]));
            firstLane.struInterval.wInterval[2] = (short) parseInt(arg(args, 65, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[2]))), unsignedShort(firstLane.struInterval.wInterval[2]));
            firstLane.struInterval.wInterval[3] = (short) parseInt(arg(args, 66, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[3]))), unsignedShort(firstLane.struInterval.wInterval[3]));
            firstLane.bySpeedCapEn = (byte) (parseBooleanFlag(arg(args, 36, unsignedByte(firstLane.bySpeedCapEn) == 1 ? "1" : "0")) ? 1 : 0);
            firstLane.bySignSpeed = (byte) parseInt(arg(args, 37, String.valueOf(unsignedByte(firstLane.bySignSpeed))), unsignedByte(firstLane.bySignSpeed));
            firstLane.bySpeedLimit = (byte) parseInt(arg(args, 38, String.valueOf(unsignedByte(firstLane.bySpeedLimit))), unsignedByte(firstLane.bySpeedLimit));
            firstLane.bySnapTimes = (byte) parseInt(arg(args, 39, String.valueOf(unsignedByte(firstLane.bySnapTimes))), unsignedByte(firstLane.bySnapTimes));
            firstLane.byOverlayDriveWay = (byte) parseInt(arg(args, 40, String.valueOf(unsignedByte(firstLane.byOverlayDriveWay))), unsignedByte(firstLane.byOverlayDriveWay));
            firstLane.byFlashMode = (byte) parseInt(arg(args, 41, String.valueOf(unsignedByte(firstLane.byFlashMode))), unsignedByte(firstLane.byFlashMode));
            firstLane.byCartSignSpeed = (byte) parseInt(arg(args, 42, String.valueOf(unsignedByte(firstLane.byCartSignSpeed))), unsignedByte(firstLane.byCartSignSpeed));
            firstLane.byCartSpeedLimit = (byte) parseInt(arg(args, 43, String.valueOf(unsignedByte(firstLane.byCartSpeedLimit))), unsignedByte(firstLane.byCartSpeedLimit));
            firstLane.byRelatedIOOutEx = (byte) parseInt(arg(args, 44, String.valueOf(unsignedByte(firstLane.byRelatedIOOutEx))), unsignedByte(firstLane.byRelatedIOOutEx));
            firstLane.byLaneType = (byte) parseInt(arg(args, 45, String.valueOf(unsignedByte(firstLane.byLaneType))), unsignedByte(firstLane.byLaneType));
            firstLane.byUseageType = (byte) parseInt(arg(args, 46, String.valueOf(unsignedByte(firstLane.byUseageType))), unsignedByte(firstLane.byUseageType));
            firstLane.byRelaLaneDirectionType = (byte) parseInt(arg(args, 47, String.valueOf(unsignedByte(firstLane.byRelaLaneDirectionType))), unsignedByte(firstLane.byRelaLaneDirectionType));
            firstLane.byLowSpeedLimit = (byte) parseInt(arg(args, 48, String.valueOf(unsignedByte(firstLane.byLowSpeedLimit))), unsignedByte(firstLane.byLowSpeedLimit));
            firstLane.byBigCarLowSpeedLimit = (byte) parseInt(arg(args, 49, String.valueOf(unsignedByte(firstLane.byBigCarLowSpeedLimit))), unsignedByte(firstLane.byBigCarLowSpeedLimit));
            firstLane.byLowSpeedCapEn = (byte) (parseBooleanFlag(arg(args, 50, unsignedByte(firstLane.byLowSpeedCapEn) == 1 ? "1" : "0")) ? 1 : 0);
            firstLane.byEmergencyCapEn = (byte) (parseBooleanFlag(arg(args, 51, unsignedByte(firstLane.byEmergencyCapEn) == 1 ? "1" : "0")) ? 1 : 0);
            firstLane.struInterval.write();
            applyPlateRecogRegion(firstLane.struPlateRecog[0], arg(args, 52, String.valueOf(unsignedByte(firstLane.struPlateRecog[0].byMode))), arg(args, 53, buildRegionPointsString(firstLane.struPlateRecog[0])));
            firstLane.write();
            rs485.struLane[0] = firstLane;

            rs485.struPlateRecog.write();
            rs485.write();
            writeStructureToUnion(trigger.uTriggerParam, rs485);
        } else if (nextType == 0x8) {
            NET_ITC_POST_RS485_RADAR_PARAM radar = (nextType == originalType) ? trigger.uTriggerParam.asRadar() : new NET_ITC_POST_RS485_RADAR_PARAM();
            radar.byRelatedLaneNum = (byte) parseInt(arg(args, 7, String.valueOf(unsignedByte(radar.byRelatedLaneNum))), unsignedByte(radar.byRelatedLaneNum));
            radar.struRadar.byRadarType = (byte) parseInt(arg(args, 17, String.valueOf(unsignedByte(radar.struRadar.byRadarType))), unsignedByte(radar.struRadar.byRadarType));
            radar.struRadar.byLevelAngle = (byte) parseInt(arg(args, 18, String.valueOf(unsignedByte(radar.struRadar.byLevelAngle))), unsignedByte(radar.struRadar.byLevelAngle));
            radar.struRadar.wRadarSensitivity = (short) parseInt(arg(args, 19, String.valueOf(unsignedShort(radar.struRadar.wRadarSensitivity))), unsignedShort(radar.struRadar.wRadarSensitivity));
            radar.struRadar.wRadarSpeedValidTime = (short) parseInt(arg(args, 20, String.valueOf(unsignedShort(radar.struRadar.wRadarSpeedValidTime))), unsignedShort(radar.struRadar.wRadarSpeedValidTime));
            radar.struRadar.fLineCorrectParam = parseFloat(arg(args, 21, String.valueOf(radar.struRadar.fLineCorrectParam)), radar.struRadar.fLineCorrectParam);
            radar.struRadar.iConstCorrectParam = parseInt(arg(args, 22, String.valueOf(radar.struRadar.iConstCorrectParam)), radar.struRadar.iConstCorrectParam);

            radar.struPlateRecog.byEnable = (byte) (parseBooleanFlag(arg(args, 23, unsignedByte(radar.struPlateRecog.byEnable) == 1 ? "1" : "0")) ? 1 : 0);
            radar.struPlateRecog.dwRecogMode = parseInt(arg(args, 24, String.valueOf(radar.struPlateRecog.dwRecogMode)), radar.struPlateRecog.dwRecogMode);
            radar.struPlateRecog.byVehicleLogoRecog = (byte) (parseBooleanFlag(arg(args, 25, unsignedByte(radar.struPlateRecog.byVehicleLogoRecog) == 1 ? "1" : "0")) ? 1 : 0);
            radar.struPlateRecog.byProvince = (byte) parseInt(arg(args, 26, String.valueOf(unsignedByte(radar.struPlateRecog.byProvince))), unsignedByte(radar.struPlateRecog.byProvince));
            radar.struPlateRecog.byRegion = (byte) parseInt(arg(args, 27, String.valueOf(unsignedByte(radar.struPlateRecog.byRegion))), unsignedByte(radar.struPlateRecog.byRegion));
            radar.struPlateRecog.byCountry = (byte) parseInt(arg(args, 28, String.valueOf(unsignedByte(radar.struPlateRecog.byCountry))), unsignedByte(radar.struPlateRecog.byCountry));
            radar.struPlateRecog.wPlatePixelWidthMin = (short) parseInt(arg(args, 29, String.valueOf(unsignedShort(radar.struPlateRecog.wPlatePixelWidthMin))), unsignedShort(radar.struPlateRecog.wPlatePixelWidthMin));
            radar.struPlateRecog.wPlatePixelWidthMax = (short) parseInt(arg(args, 30, String.valueOf(unsignedShort(radar.struPlateRecog.wPlatePixelWidthMax))), unsignedShort(radar.struPlateRecog.wPlatePixelWidthMax));

            NET_ITC_LANE_PARAM firstLane = radar.struLane[0];
            firstLane.byEnable = (byte) (parseBooleanFlag(arg(args, 31, unsignedByte(firstLane.byEnable) == 1 ? "1" : "0")) ? 1 : 0);
            firstLane.byRelatedDriveWay = (byte) parseInt(arg(args, 32, String.valueOf(unsignedByte(firstLane.byRelatedDriveWay))), unsignedByte(firstLane.byRelatedDriveWay));
            firstLane.wDistance = (short) parseInt(arg(args, 33, String.valueOf(unsignedShort(firstLane.wDistance))), unsignedShort(firstLane.wDistance));
            firstLane.wTrigDelayTime = (short) parseInt(arg(args, 34, String.valueOf(unsignedShort(firstLane.wTrigDelayTime))), unsignedShort(firstLane.wTrigDelayTime));
            firstLane.byTrigDelayDistance = (byte) parseInt(arg(args, 35, String.valueOf(unsignedByte(firstLane.byTrigDelayDistance))), unsignedByte(firstLane.byTrigDelayDistance));
            firstLane.struInterval.byIntervalType = (byte) parseInt(arg(args, 62, String.valueOf(unsignedByte(firstLane.struInterval.byIntervalType))), unsignedByte(firstLane.struInterval.byIntervalType));
            firstLane.struInterval.wInterval[0] = (short) parseInt(arg(args, 63, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[0]))), unsignedShort(firstLane.struInterval.wInterval[0]));
            firstLane.struInterval.wInterval[1] = (short) parseInt(arg(args, 64, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[1]))), unsignedShort(firstLane.struInterval.wInterval[1]));
            firstLane.struInterval.wInterval[2] = (short) parseInt(arg(args, 65, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[2]))), unsignedShort(firstLane.struInterval.wInterval[2]));
            firstLane.struInterval.wInterval[3] = (short) parseInt(arg(args, 66, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[3]))), unsignedShort(firstLane.struInterval.wInterval[3]));
            firstLane.bySpeedCapEn = (byte) (parseBooleanFlag(arg(args, 36, unsignedByte(firstLane.bySpeedCapEn) == 1 ? "1" : "0")) ? 1 : 0);
            firstLane.bySignSpeed = (byte) parseInt(arg(args, 37, String.valueOf(unsignedByte(firstLane.bySignSpeed))), unsignedByte(firstLane.bySignSpeed));
            firstLane.bySpeedLimit = (byte) parseInt(arg(args, 38, String.valueOf(unsignedByte(firstLane.bySpeedLimit))), unsignedByte(firstLane.bySpeedLimit));
            firstLane.bySnapTimes = (byte) parseInt(arg(args, 39, String.valueOf(unsignedByte(firstLane.bySnapTimes))), unsignedByte(firstLane.bySnapTimes));
            firstLane.byOverlayDriveWay = (byte) parseInt(arg(args, 40, String.valueOf(unsignedByte(firstLane.byOverlayDriveWay))), unsignedByte(firstLane.byOverlayDriveWay));
            firstLane.byFlashMode = (byte) parseInt(arg(args, 41, String.valueOf(unsignedByte(firstLane.byFlashMode))), unsignedByte(firstLane.byFlashMode));
            firstLane.byCartSignSpeed = (byte) parseInt(arg(args, 42, String.valueOf(unsignedByte(firstLane.byCartSignSpeed))), unsignedByte(firstLane.byCartSignSpeed));
            firstLane.byCartSpeedLimit = (byte) parseInt(arg(args, 43, String.valueOf(unsignedByte(firstLane.byCartSpeedLimit))), unsignedByte(firstLane.byCartSpeedLimit));
            firstLane.byRelatedIOOutEx = (byte) parseInt(arg(args, 44, String.valueOf(unsignedByte(firstLane.byRelatedIOOutEx))), unsignedByte(firstLane.byRelatedIOOutEx));
            firstLane.byLaneType = (byte) parseInt(arg(args, 45, String.valueOf(unsignedByte(firstLane.byLaneType))), unsignedByte(firstLane.byLaneType));
            firstLane.byUseageType = (byte) parseInt(arg(args, 46, String.valueOf(unsignedByte(firstLane.byUseageType))), unsignedByte(firstLane.byUseageType));
            firstLane.byRelaLaneDirectionType = (byte) parseInt(arg(args, 47, String.valueOf(unsignedByte(firstLane.byRelaLaneDirectionType))), unsignedByte(firstLane.byRelaLaneDirectionType));
            firstLane.byLowSpeedLimit = (byte) parseInt(arg(args, 48, String.valueOf(unsignedByte(firstLane.byLowSpeedLimit))), unsignedByte(firstLane.byLowSpeedLimit));
            firstLane.byBigCarLowSpeedLimit = (byte) parseInt(arg(args, 49, String.valueOf(unsignedByte(firstLane.byBigCarLowSpeedLimit))), unsignedByte(firstLane.byBigCarLowSpeedLimit));
            firstLane.byLowSpeedCapEn = (byte) (parseBooleanFlag(arg(args, 50, unsignedByte(firstLane.byLowSpeedCapEn) == 1 ? "1" : "0")) ? 1 : 0);
            firstLane.byEmergencyCapEn = (byte) (parseBooleanFlag(arg(args, 51, unsignedByte(firstLane.byEmergencyCapEn) == 1 ? "1" : "0")) ? 1 : 0);
            firstLane.struInterval.write();
            applyPlateRecogRegion(firstLane.struPlateRecog[0], arg(args, 52, String.valueOf(unsignedByte(firstLane.struPlateRecog[0].byMode))), arg(args, 53, buildRegionPointsString(firstLane.struPlateRecog[0])));
            firstLane.write();
            radar.struLane[0] = firstLane;

            radar.struPlateRecog.write();
            radar.struRadar.write();
            radar.write();
            writeStructureToUnion(trigger.uTriggerParam, radar);
        } else if (nextType == 0x10) {
            NET_ITC_POST_VTCOIL_PARAM vt = (nextType == originalType) ? trigger.uTriggerParam.asVtCoil() : new NET_ITC_POST_VTCOIL_PARAM();
            vt.byRelatedLaneNum = (byte) parseInt(arg(args, 7, String.valueOf(unsignedByte(vt.byRelatedLaneNum))), unsignedByte(vt.byRelatedLaneNum));
            vt.byIsDisplay = (byte) (parseBooleanFlag(arg(args, 10, unsignedByte(vt.byIsDisplay) == 1 ? "1" : "0")) ? 1 : 0);
            vt.bySnapMode = (byte) parseInt(arg(args, 11, String.valueOf(unsignedByte(vt.bySnapMode))), unsignedByte(vt.bySnapMode));
            vt.bySpeedDetector = (byte) parseInt(arg(args, 12, String.valueOf(unsignedByte(vt.bySpeedDetector))), unsignedByte(vt.bySpeedDetector));
            vt.dwSceneMode = parseInt(arg(args, 13, String.valueOf(vt.dwSceneMode)), vt.dwSceneMode);
            vt.write();
            writeStructureToUnion(trigger.uTriggerParam, vt);
        } else if ((nextType & 0x20) != 0 || (nextType & 0x100000) != 0) {
            NET_ITC_POST_HVT_PARAM_V50 hvt = ((nextType == originalType) && ((originalType & 0x20) != 0 || (originalType & 0x100000) != 0))
                    ? trigger.uTriggerParam.asHvtV50() : new NET_ITC_POST_HVT_PARAM_V50();
            hvt.byLaneNum = (byte) parseInt(arg(args, 7, String.valueOf(unsignedByte(hvt.byLaneNum))), unsignedByte(hvt.byLaneNum));
            hvt.byCapType = (byte) parseInt(arg(args, 14, String.valueOf(unsignedByte(hvt.byCapType))), unsignedByte(hvt.byCapType));
            hvt.byCapMode = (byte) parseInt(arg(args, 15, String.valueOf(unsignedByte(hvt.byCapMode))), unsignedByte(hvt.byCapMode));
            hvt.bySecneMode = (byte) parseInt(arg(args, 13, String.valueOf(unsignedByte(hvt.bySecneMode))), unsignedByte(hvt.bySecneMode));
            hvt.bySpeedMode = (byte) parseInt(arg(args, 16, String.valueOf(unsignedByte(hvt.bySpeedMode))), unsignedByte(hvt.bySpeedMode));
            hvt.struPlateRecog.byEnable = (byte) (parseBooleanFlag(arg(args, 23, unsignedByte(hvt.struPlateRecog.byEnable) == 1 ? "1" : "0")) ? 1 : 0);
            hvt.struPlateRecog.dwRecogMode = parseInt(arg(args, 24, String.valueOf(hvt.struPlateRecog.dwRecogMode)), hvt.struPlateRecog.dwRecogMode);
            hvt.struPlateRecog.byVehicleLogoRecog = (byte) (parseBooleanFlag(arg(args, 25, unsignedByte(hvt.struPlateRecog.byVehicleLogoRecog) == 1 ? "1" : "0")) ? 1 : 0);
            hvt.struPlateRecog.byProvince = (byte) parseInt(arg(args, 26, String.valueOf(unsignedByte(hvt.struPlateRecog.byProvince))), unsignedByte(hvt.struPlateRecog.byProvince));
            hvt.struPlateRecog.byRegion = (byte) parseInt(arg(args, 27, String.valueOf(unsignedByte(hvt.struPlateRecog.byRegion))), unsignedByte(hvt.struPlateRecog.byRegion));
            hvt.struPlateRecog.byCountry = (byte) parseInt(arg(args, 28, String.valueOf(unsignedByte(hvt.struPlateRecog.byCountry))), unsignedByte(hvt.struPlateRecog.byCountry));
            hvt.struPlateRecog.wPlatePixelWidthMin = (short) parseInt(arg(args, 29, String.valueOf(unsignedShort(hvt.struPlateRecog.wPlatePixelWidthMin))), unsignedShort(hvt.struPlateRecog.wPlatePixelWidthMin));
            hvt.struPlateRecog.wPlatePixelWidthMax = (short) parseInt(arg(args, 30, String.valueOf(unsignedShort(hvt.struPlateRecog.wPlatePixelWidthMax))), unsignedShort(hvt.struPlateRecog.wPlatePixelWidthMax));

            NET_ITC_LANE_HVT_PARAM_V50 firstLane = hvt.struLaneParam[0];
            firstLane.byLaneNO = (byte) parseInt(arg(args, 40, String.valueOf(defaultPositive(unsignedByte(firstLane.byLaneNO), 1))), defaultPositive(unsignedByte(firstLane.byLaneNO), 1));
            firstLane.byRelatedDriveWay = (byte) parseInt(arg(args, 32, String.valueOf(defaultPositive(unsignedByte(firstLane.byRelatedDriveWay), 1))), defaultPositive(unsignedByte(firstLane.byRelatedDriveWay), 1));
            firstLane.byFlashMode = (byte) parseInt(arg(args, 41, String.valueOf(unsignedByte(firstLane.byFlashMode))), unsignedByte(firstLane.byFlashMode));
            firstLane.bySignSpeed = (byte) parseInt(arg(args, 37, String.valueOf(unsignedByte(firstLane.bySignSpeed))), unsignedByte(firstLane.bySignSpeed));
            firstLane.bySpeedLimit = (byte) parseInt(arg(args, 38, String.valueOf(unsignedByte(firstLane.bySpeedLimit))), unsignedByte(firstLane.bySpeedLimit));
            firstLane.bySnapTimes = (byte) parseInt(arg(args, 39, String.valueOf(defaultPositive(unsignedByte(firstLane.bySnapTimes), 1))), defaultPositive(unsignedByte(firstLane.bySnapTimes), 1));
            firstLane.byBigCarSignSpeed = (byte) parseInt(arg(args, 42, String.valueOf(unsignedByte(firstLane.byBigCarSignSpeed))), unsignedByte(firstLane.byBigCarSignSpeed));
            firstLane.byBigCarSpeedLimit = (byte) parseInt(arg(args, 43, String.valueOf(unsignedByte(firstLane.byBigCarSpeedLimit))), unsignedByte(firstLane.byBigCarSpeedLimit));
            firstLane.dwRelatedIOOut = parseInt(arg(args, 44, String.valueOf(firstLane.dwRelatedIOOut)), firstLane.dwRelatedIOOut);
            firstLane.byLaneType = (byte) parseInt(arg(args, 45, String.valueOf(unsignedByte(firstLane.byLaneType))), unsignedByte(firstLane.byLaneType));
            firstLane.struLane.byUseageType = (byte) parseInt(arg(args, 46, String.valueOf(unsignedByte(firstLane.struLane.byUseageType))), unsignedByte(firstLane.struLane.byUseageType));
            firstLane.byRelaLaneDirectionType = (byte) parseInt(arg(args, 47, String.valueOf(unsignedByte(firstLane.byRelaLaneDirectionType))), unsignedByte(firstLane.byRelaLaneDirectionType));
            firstLane.byLowSpeedLimit = (byte) parseInt(arg(args, 48, String.valueOf(unsignedByte(firstLane.byLowSpeedLimit))), unsignedByte(firstLane.byLowSpeedLimit));
            firstLane.byBigCarLowSpeedLimit = (byte) parseInt(arg(args, 49, String.valueOf(unsignedByte(firstLane.byBigCarLowSpeedLimit))), unsignedByte(firstLane.byBigCarLowSpeedLimit));
            firstLane.struInterval.byIntervalType = (byte) parseInt(arg(args, 62, String.valueOf(unsignedByte(firstLane.struInterval.byIntervalType))), unsignedByte(firstLane.struInterval.byIntervalType));
            firstLane.struInterval.wInterval[0] = (short) parseInt(arg(args, 63, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[0]))), unsignedShort(firstLane.struInterval.wInterval[0]));
            firstLane.struInterval.wInterval[1] = (short) parseInt(arg(args, 64, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[1]))), unsignedShort(firstLane.struInterval.wInterval[1]));
            firstLane.struInterval.wInterval[2] = (short) parseInt(arg(args, 65, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[2]))), unsignedShort(firstLane.struInterval.wInterval[2]));
            firstLane.struInterval.wInterval[3] = (short) parseInt(arg(args, 66, String.valueOf(unsignedShort(firstLane.struInterval.wInterval[3]))), unsignedShort(firstLane.struInterval.wInterval[3]));
            firstLane.dwVioDetectType = setBit(firstLane.dwVioDetectType, 0x800, parseBooleanFlag(arg(args, 36, (firstLane.dwVioDetectType & 0x800) != 0 ? "1" : "0")));
            firstLane.dwVioDetectType = setBit(firstLane.dwVioDetectType, 0x1000, parseBooleanFlag(arg(args, 50, (firstLane.dwVioDetectType & 0x1000) != 0 ? "1" : "0")));
            firstLane.dwVioDetectType = setBit(firstLane.dwVioDetectType, 0x2000, parseBooleanFlag(arg(args, 51, (firstLane.dwVioDetectType & 0x2000) != 0 ? "1" : "0")));
            firstLane.struLane.write();
            firstLane.struInterval.write();
            firstLane.write();
            hvt.struLaneParam[0] = firstLane;
            hvt.struPlateRecog.write();
            hvt.write();
            writeStructureToUnion(trigger.uTriggerParam, hvt);
        } else if (nextType == 0x200 || nextType == 0x10000) {
            NET_ITC_EPOLICE_RS485_PARAM epolice = ((nextType == originalType) && (originalType == 0x200 || originalType == 0x10000))
                    ? trigger.uTriggerParam.asEpoliceRs485() : new NET_ITC_EPOLICE_RS485_PARAM();
            epolice.byRelatedLaneNum = (byte) parseInt(arg(args, 7, String.valueOf(unsignedByte(epolice.byRelatedLaneNum))), unsignedByte(epolice.byRelatedLaneNum));
            epolice.byTrafficLightSignalSrc = (byte) parseInt(arg(args, 67, String.valueOf(unsignedByte(epolice.byTrafficLightSignalSrc))), unsignedByte(epolice.byTrafficLightSignalSrc));
            epolice.struPlateRecog.byEnable = (byte) (parseBooleanFlag(arg(args, 23, unsignedByte(epolice.struPlateRecog.byEnable) == 1 ? "1" : "0")) ? 1 : 0);
            epolice.struPlateRecog.dwRecogMode = parseInt(arg(args, 24, String.valueOf(epolice.struPlateRecog.dwRecogMode)), epolice.struPlateRecog.dwRecogMode);
            epolice.struPlateRecog.byVehicleLogoRecog = (byte) (parseBooleanFlag(arg(args, 25, unsignedByte(epolice.struPlateRecog.byVehicleLogoRecog) == 1 ? "1" : "0")) ? 1 : 0);
            epolice.struPlateRecog.byProvince = (byte) parseInt(arg(args, 26, String.valueOf(unsignedByte(epolice.struPlateRecog.byProvince))), unsignedByte(epolice.struPlateRecog.byProvince));
            epolice.struPlateRecog.byRegion = (byte) parseInt(arg(args, 27, String.valueOf(unsignedByte(epolice.struPlateRecog.byRegion))), unsignedByte(epolice.struPlateRecog.byRegion));
            epolice.struPlateRecog.byCountry = (byte) parseInt(arg(args, 28, String.valueOf(unsignedByte(epolice.struPlateRecog.byCountry))), unsignedByte(epolice.struPlateRecog.byCountry));
            epolice.struPlateRecog.wPlatePixelWidthMin = (short) parseInt(arg(args, 29, String.valueOf(unsignedShort(epolice.struPlateRecog.wPlatePixelWidthMin))), unsignedShort(epolice.struPlateRecog.wPlatePixelWidthMin));
            epolice.struPlateRecog.wPlatePixelWidthMax = (short) parseInt(arg(args, 30, String.valueOf(unsignedShort(epolice.struPlateRecog.wPlatePixelWidthMax))), unsignedShort(epolice.struPlateRecog.wPlatePixelWidthMax));

            NET_ITC_EPOLICE_LANE_PARAM firstLane = epolice.struLane[0];
            firstLane.byEnable = 1;
            firstLane.byRelatedDriveWay = (byte) parseInt(arg(args, 32, String.valueOf(defaultPositive(unsignedByte(firstLane.byRelatedDriveWay), 1))), defaultPositive(unsignedByte(firstLane.byRelatedDriveWay), 1));
            firstLane.wDistance = (short) parseInt(arg(args, 33, String.valueOf(unsignedShort(firstLane.wDistance))), unsignedShort(firstLane.wDistance));
            firstLane.bySignSpeed = (byte) parseInt(arg(args, 37, String.valueOf(unsignedByte(firstLane.bySignSpeed))), unsignedByte(firstLane.bySignSpeed));
            firstLane.bySpeedLimit = (byte) parseInt(arg(args, 38, String.valueOf(unsignedByte(firstLane.bySpeedLimit))), unsignedByte(firstLane.bySpeedLimit));
            firstLane.byOverlayDriveWay = (byte) parseInt(arg(args, 40, String.valueOf(defaultPositive(unsignedByte(firstLane.byOverlayDriveWay), 1))), defaultPositive(unsignedByte(firstLane.byOverlayDriveWay), 1));
            firstLane.byFlashMode = (byte) parseInt(arg(args, 41, String.valueOf(unsignedByte(firstLane.byFlashMode))), unsignedByte(firstLane.byFlashMode));
            firstLane.byBigCarSignSpeed = (byte) parseInt(arg(args, 42, String.valueOf(unsignedByte(firstLane.byBigCarSignSpeed))), unsignedByte(firstLane.byBigCarSignSpeed));
            firstLane.byBigCarSpeedLimit = (byte) parseInt(arg(args, 43, String.valueOf(unsignedByte(firstLane.byBigCarSpeedLimit))), unsignedByte(firstLane.byBigCarSpeedLimit));
            firstLane.byRelatedIOOutEx = (byte) parseInt(arg(args, 44, String.valueOf(unsignedByte(firstLane.byRelatedIOOutEx))), unsignedByte(firstLane.byRelatedIOOutEx));
            firstLane.byRelaLaneDirectionType = (byte) parseInt(arg(args, 47, String.valueOf(unsignedByte(firstLane.byRelaLaneDirectionType))), unsignedByte(firstLane.byRelaLaneDirectionType));
            firstLane.struSerialInfo.byIntervalType = (byte) parseInt(arg(args, 62, String.valueOf(unsignedByte(firstLane.struSerialInfo.byIntervalType))), unsignedByte(firstLane.struSerialInfo.byIntervalType));
            firstLane.struSerialInfo.wInterval = (short) parseInt(arg(args, 63, String.valueOf(unsignedShort(firstLane.struSerialInfo.wInterval))), unsignedShort(firstLane.struSerialInfo.wInterval));
            firstLane.bySnapPicPreRecord = (byte) parseInt(arg(args, 68, String.valueOf(unsignedByte(firstLane.bySnapPicPreRecord))), unsignedByte(firstLane.bySnapPicPreRecord));
            firstLane.bySerialType = (byte) parseInt(arg(args, 69, String.valueOf(unsignedByte(firstLane.bySerialType))), unsignedByte(firstLane.bySerialType));
            firstLane.struSerialInfo.bySerialProtocol = (byte) parseInt(arg(args, 70, String.valueOf(unsignedByte(firstLane.struSerialInfo.bySerialProtocol))), unsignedByte(firstLane.struSerialInfo.bySerialProtocol));
            firstLane.struSerialInfo.byNormalPassProtocol = (byte) parseInt(arg(args, 71, String.valueOf(unsignedByte(firstLane.struSerialInfo.byNormalPassProtocol))), unsignedByte(firstLane.struSerialInfo.byNormalPassProtocol));
            firstLane.struSerialInfo.byInverseProtocol = (byte) parseInt(arg(args, 72, String.valueOf(unsignedByte(firstLane.struSerialInfo.byInverseProtocol))), unsignedByte(firstLane.struSerialInfo.byInverseProtocol));
            firstLane.struSerialInfo.bySpeedProtocol = (byte) parseInt(arg(args, 73, String.valueOf(unsignedByte(firstLane.struSerialInfo.bySpeedProtocol))), unsignedByte(firstLane.struSerialInfo.bySpeedProtocol));
            applyPlateRecogRegion(firstLane.struPlateRecog[0], arg(args, 52, String.valueOf(unsignedByte(firstLane.struPlateRecog[0].byMode))), arg(args, 53, buildRegionPointsString(firstLane.struPlateRecog[0])));
            firstLane.struSerialInfo.write();
            firstLane.write();
            epolice.struLane[0] = firstLane;
            int copyParamMask = parseInt(arg(args, 75, "1"), 1) | 1;
            int copyProtocolMask = parseInt(arg(args, 74, "1"), 1) | 1;
            for (int i = 1; i < Math.min(epolice.struLane.length, 3); i += 1) {
                NET_ITC_EPOLICE_LANE_PARAM item = epolice.struLane[i];
                if ((copyParamMask & (1 << i)) != 0) copyEpoliceLaneParams(firstLane, item, false);
                if ((copyProtocolMask & (1 << i)) != 0) copyEpoliceLaneParams(firstLane, item, true);
                item.write();
                epolice.struLane[i] = item;
            }
            epolice.struPlateRecog.write();
            epolice.write();
            writeStructureToUnion(trigger.uTriggerParam, epolice);
        }

        config.write();

        int triggerModeForCond = nextType != 0 ? nextType : currentTriggerType;
        int[][] combos = {
            {1, triggerModeForCond},
            {0, triggerModeForCond},
            {1, 0},
            {0, 0}
        };
        int lastDeviceConfigError = 0;
        int lastSetStatus = 0;
        boolean saved = false;
        for (int[] combo : combos) {
            // NET_DVR_TRIGGER_COND mirrors the Hikvision demo: channel + trigger mode select the target config.
            NET_DVR_TRIGGER_COND condition = new NET_DVR_TRIGGER_COND();
            condition.dwSize = condition.size();
            condition.dwChannel = combo[0];
            condition.dwTriggerMode = combo[1];
            condition.write();

            config.write();
            IntByReference statusList = new IntByReference(0);
            boolean ok = sdk.NET_DVR_SetDeviceConfig(
                userId, NET_DVR_SET_TRIGGEREX_CFG, 1,
                condition.getPointer(), condition.size(),
                statusList.getPointer(),
                config.getPointer(), config.size()
            );
            lastDeviceConfigError = ok ? 0 : sdk.NET_DVR_GetLastError();
            lastSetStatus = statusList.getValue();
            if (ok && (lastSetStatus == 0 || lastSetStatus == 1)) {
                saved = true;
                break;
            }
        }
        if (!saved) {
            int legacyError = 0;
            for (int legacyChannel : new int[] {1, 0}) {
                config.write();
                boolean legacyOk = sdk.NET_DVR_SetDVRConfig(
                    userId,
                    NET_ITC_SET_TRIGGERCFG,
                    legacyChannel,
                    config.getPointer(),
                    config.size()
                );
                if (legacyOk) {
                    saved = true;
                    break;
                }
                legacyError = sdk.NET_DVR_GetLastError();
            }
            if (!saved) {
                fail(
                    "NET_DVR_SetDeviceConfig(TRIGGEREX_CFG) failed/status=" + lastSetStatus
                    + ", fallback NET_DVR_SetDVRConfig(TRIGGERCFG) failed",
                    legacyError != 0 ? legacyError : lastDeviceConfigError
                );
                return "";
            }
        }
        if (triggerModeForCond != 0) {
            NET_DVR_CURTRIGGERMODE currentAfterSave = currentMode == null ? new NET_DVR_CURTRIGGERMODE() : currentMode;
            currentAfterSave.dwSize = currentAfterSave.size();
            if (!setCurrentTriggerModeStruct(userId, currentAfterSave, triggerModeForCond)) {
                return "";
            }
        }
        return buildTriggerConfig(userId);
    }

    private static String applyVideoEpoliceTriggerConfig(int userId, String[] args) {
        NET_ITC_VIDEO_TRIGGER_PARAM config = loadVideoTriggerConfigStruct(userId, 0x20000);
        if (config == null) {
            config = new NET_ITC_VIDEO_TRIGGER_PARAM();
            config.dwSize = config.size();
            config.dwMode = 0x20000;
        }
        config.dwSize = config.size();
        config.dwMode = 0x20000;
        NET_ITC_VIDEO_EPOLICE_PARAM video = config.uVideoTrigger.asVideoEpolice();
        video.byEnable = (byte) (parseBooleanFlag(arg(args, 5, unsignedByte(video.byEnable) == 1 ? "1" : "0")) ? 1 : 0);
        video.byLaneNum = (byte) parseInt(arg(args, 7, String.valueOf(defaultPositive(unsignedByte(video.byLaneNum), 1))), defaultPositive(unsignedByte(video.byLaneNum), 1));
        video.struTrafficLight.bySource = (byte) parseInt(arg(args, 101, String.valueOf(unsignedByte(video.struTrafficLight.bySource))), unsignedByte(video.struTrafficLight.bySource));

        NET_ITC_LANE_VIDEO_EPOLICE_PARAM lane = video.struLaneParam[0];
        lane.byLaneNO = (byte) parseInt(arg(args, 32, String.valueOf(defaultPositive(unsignedByte(lane.byLaneNO), 1))), defaultPositive(unsignedByte(lane.byLaneNO), 1));
        lane.byRelaLaneDirectionType = (byte) parseInt(arg(args, 47, String.valueOf(unsignedByte(lane.byRelaLaneDirectionType))), unsignedByte(lane.byRelaLaneDirectionType));
        lane.struLane.byUseageType = (byte) parseInt(arg(args, 46, String.valueOf(unsignedByte(lane.struLane.byUseageType))), unsignedByte(lane.struLane.byUseageType));
        lane.struLane.byCarDriveDirect = (byte) parseInt(arg(args, 100, String.valueOf(unsignedByte(lane.struLane.byCarDriveDirect))), unsignedByte(lane.struLane.byCarDriveDirect));
        lane.byCarSpeedLimit = (byte) parseInt(arg(args, 38, String.valueOf(unsignedByte(lane.byCarSpeedLimit))), unsignedByte(lane.byCarSpeedLimit));
        lane.byCarSignSpeed = (byte) parseInt(arg(args, 37, String.valueOf(unsignedByte(lane.byCarSignSpeed))), unsignedByte(lane.byCarSignSpeed));
        lane.bySnapPicPreRecord = (byte) parseInt(arg(args, 68, String.valueOf(unsignedByte(lane.bySnapPicPreRecord))), unsignedByte(lane.bySnapPicPreRecord));
        lane.struInterval.byIntervalType = (byte) parseInt(arg(args, 76, String.valueOf(unsignedByte(lane.struInterval.byIntervalType))), unsignedByte(lane.struInterval.byIntervalType));
        lane.struInterval.wInterval[0] = (short) parseInt(arg(args, 77, String.valueOf(unsignedShort(lane.struInterval.wInterval[0]))), unsignedShort(lane.struInterval.wInterval[0]));

        NET_ITC_VIOLATION_DETECT_PARAM vio = lane.struVioDetect;
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x01, parseBooleanFlag(arg(args, 78, (vio.dwVioDetectType & 0x01) != 0 ? "1" : "0")));
        vio.byPostSnapTimes = (byte) parseInt(arg(args, 79, String.valueOf(defaultPositive(unsignedByte(vio.byPostSnapTimes), 1))), defaultPositive(unsignedByte(vio.byPostSnapTimes), 1));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x10, parseBooleanFlag(arg(args, 80, (vio.dwVioDetectType & 0x10) != 0 ? "1" : "0")));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x8000, parseBooleanFlag(arg(args, 81, (vio.dwVioDetectType & 0x8000) != 0 ? "1" : "0")));
        vio.byTurnAroundEnable = (byte) parseInt(arg(args, 82, String.valueOf(defaultPositive(unsignedByte(vio.byTurnAroundEnable), 1))), defaultPositive(unsignedByte(vio.byTurnAroundEnable), 1));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x80, parseBooleanFlag(arg(args, 83, (vio.dwVioDetectType & 0x80) != 0 ? "1" : "0")));
        vio.byChangeLaneTimes = (byte) parseInt(arg(args, 84, String.valueOf(defaultPositive(unsignedByte(vio.byChangeLaneTimes), 1))), defaultPositive(unsignedByte(vio.byChangeLaneTimes), 1));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x04, parseBooleanFlag(arg(args, 85, (vio.dwVioDetectType & 0x04) != 0 ? "1" : "0")));
        vio.byReverseSnapTimes = (byte) parseInt(arg(args, 86, String.valueOf(defaultPositive(unsignedByte(vio.byReverseSnapTimes), 1))), defaultPositive(unsignedByte(vio.byReverseSnapTimes), 1));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x02, parseBooleanFlag(arg(args, 87, (vio.dwVioDetectType & 0x02) != 0 ? "1" : "0")));
        vio.byDriveLineSnapTimes = (byte) parseInt(arg(args, 88, String.valueOf(defaultPositive(unsignedByte(vio.byDriveLineSnapTimes), 1))), defaultPositive(unsignedByte(vio.byDriveLineSnapTimes), 1));
        vio.byDriveLineSnapSen = (byte) parseInt(arg(args, 89, String.valueOf(unsignedByte(vio.byDriveLineSnapSen))), unsignedByte(vio.byDriveLineSnapSen));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x40, parseBooleanFlag(arg(args, 90, (vio.dwVioDetectType & 0x40) != 0 ? "1" : "0")));
        vio.byNonDriveSnapTimes = (byte) parseInt(arg(args, 91, String.valueOf(defaultPositive(unsignedByte(vio.byNonDriveSnapTimes), 1))), defaultPositive(unsignedByte(vio.byNonDriveSnapTimes), 1));
        vio.wStayTime = (short) parseInt(arg(args, 92, String.valueOf(unsignedShort(vio.wStayTime))), unsignedShort(vio.wStayTime));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x200, parseBooleanFlag(arg(args, 93, (vio.dwVioDetectType & 0x200) != 0 ? "1" : "0")));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x400, parseBooleanFlag(arg(args, 94, (vio.dwVioDetectType & 0x400) != 0 ? "1" : "0")));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x100, parseBooleanFlag(arg(args, 95, (vio.dwVioDetectType & 0x100) != 0 ? "1" : "0")));
        vio.bybanTimes = (byte) parseInt(arg(args, 96, String.valueOf(defaultPositive(unsignedByte(vio.bybanTimes), 1))), defaultPositive(unsignedByte(vio.bybanTimes), 1));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x800, parseBooleanFlag(arg(args, 97, (vio.dwVioDetectType & 0x800) != 0 ? "1" : "0")));
        vio.bySpeedTimes = (byte) parseInt(arg(args, 98, String.valueOf(defaultPositive(unsignedByte(vio.bySpeedTimes), 1))), defaultPositive(unsignedByte(vio.bySpeedTimes), 1));
        vio.dwVioDetectType = setBit(vio.dwVioDetectType, 0x08, parseBooleanFlag(arg(args, 99, (vio.dwVioDetectType & 0x08) != 0 ? "1" : "0")));

        lane.struLane.write();
        lane.struVioDetect.write();
        lane.struInterval.write();
        lane.write();
        video.struLaneParam[0] = lane;
        int copyMask = parseInt(arg(args, 102, "1"), 1) | 1;
        for (int i = 1; i < Math.min(video.struLaneParam.length, 3); i += 1) {
            if ((copyMask & (1 << i)) == 0) continue;
            NET_ITC_LANE_VIDEO_EPOLICE_PARAM target = video.struLaneParam[i];
            byte originalLaneNo = target.byLaneNO;
            byte[] data = lane.getPointer().getByteArray(0, lane.size());
            target.getPointer().write(0, data, 0, Math.min(data.length, target.size()));
            target.read();
            target.byLaneNO = originalLaneNo == 0 ? (byte) (i + 1) : originalLaneNo;
            target.write();
            video.struLaneParam[i] = target;
        }
        video.struTrafficLight.write();
        video.write();
        writeStructureToUnion(config.uVideoTrigger, video);
        config.write();

        if (!saveVideoTriggerConfigStruct(userId, config)) {
            return "";
        }
        NET_DVR_CURTRIGGERMODE currentMode = loadCurrentTriggerModeStruct(userId);
        NET_DVR_CURTRIGGERMODE targetMode = currentMode == null ? new NET_DVR_CURTRIGGERMODE() : currentMode;
        targetMode.dwSize = targetMode.size();
        if (!setCurrentTriggerModeStruct(userId, targetMode, 0x20000)) {
            return "";
        }
        return buildVideoEpoliceTriggerConfig(userId);
    }

    private static int countRegionPoints(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).trim();
        if (text.isEmpty()) return 0;
        String[] parts = text.split(";");
        int count = 0;
        for (String part : parts) {
            if (part != null && !part.trim().isEmpty()) count += 1;
        }
        return count;
    }

    private static String buildRegionPointsString(NET_ITC_PLATE_RECOG_REGION_PARAM region) {
        int mode = unsignedByte(region.byMode);
        if (mode == 1) {
            NET_VCA_RECT rect = asRectRegion(region);
            float x1 = clamp01(rect.fX);
            float y1 = clamp01(rect.fY);
            float x2 = clamp01(rect.fX + rect.fWidth);
            float y2 = clamp01(rect.fY + rect.fHeight);
            return pointString(x1, y1) + ";" + pointString(x2, y1) + ";" + pointString(x2, y2) + ";" + pointString(x1, y2);
        }
        if (mode == 2) {
            NET_ITC_POLYGON polygon = asPolygonRegion(region);
            int pointNum = Math.max(0, Math.min(polygon.dwPointNum, polygon.struPos.length));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < pointNum; i += 1) {
                if (i > 0) sb.append(';');
                sb.append(pointString(clamp01(polygon.struPos[i].fX), clamp01(polygon.struPos[i].fY)));
            }
            return sb.toString();
        }
        return "";
    }

    private static void applyPlateRecogRegion(NET_ITC_PLATE_RECOG_REGION_PARAM region, String modeRaw, String pointsRaw) {
        float[][] points = parseRegionPoints(pointsRaw);
        if (points.length == 0) {
            region.byMode = 0;
            Arrays.fill(region.uRegion, (byte) 0);
            region.write();
            return;
        }

        int requestedMode = parseInt(modeRaw, points.length >= 3 ? 2 : 1);
        if (requestedMode == 1 && points.length >= 2) {
            float minX = 1f;
            float minY = 1f;
            float maxX = 0f;
            float maxY = 0f;
            for (float[] point : points) {
                minX = Math.min(minX, point[0]);
                minY = Math.min(minY, point[1]);
                maxX = Math.max(maxX, point[0]);
                maxY = Math.max(maxY, point[1]);
            }
            NET_VCA_RECT rect = new NET_VCA_RECT();
            rect.fX = clamp01(minX);
            rect.fY = clamp01(minY);
            rect.fWidth = clamp01(maxX - minX);
            rect.fHeight = clamp01(maxY - minY);
            rect.write();
            region.byMode = 1;
            Arrays.fill(region.uRegion, (byte) 0);
            byte[] raw = rect.getPointer().getByteArray(0, rect.size());
            System.arraycopy(raw, 0, region.uRegion, 0, Math.min(raw.length, region.uRegion.length));
            region.write();
            return;
        }

        NET_ITC_POLYGON polygon = new NET_ITC_POLYGON();
        polygon.dwPointNum = Math.min(points.length, polygon.struPos.length);
        for (int i = 0; i < polygon.dwPointNum; i += 1) {
            polygon.struPos[i].fX = clamp01(points[i][0]);
            polygon.struPos[i].fY = clamp01(points[i][1]);
            polygon.struPos[i].write();
        }
        polygon.write();
        region.byMode = 2;
        Arrays.fill(region.uRegion, (byte) 0);
        byte[] raw = polygon.getPointer().getByteArray(0, polygon.size());
        System.arraycopy(raw, 0, region.uRegion, 0, Math.min(raw.length, region.uRegion.length));
        region.write();
    }

    private static float[][] parseRegionPoints(String raw) {
        String text = String.valueOf(raw == null ? "" : raw).trim();
        if (text.isEmpty()) return new float[0][];
        String[] parts = text.split(";");
        float[][] points = new float[Math.min(parts.length, 20)][];
        int count = 0;
        for (String part : parts) {
            String item = String.valueOf(part == null ? "" : part).trim();
            if (item.isEmpty()) continue;
            String[] xy = item.split(",");
            if (xy.length != 2) continue;
            float x = parseFloat(xy[0], Float.NaN);
            float y = parseFloat(xy[1], Float.NaN);
            if (!Float.isFinite(x) || !Float.isFinite(y)) continue;
            points[count++] = new float[]{ clamp01(x), clamp01(y) };
        }
        return Arrays.copyOf(points, count);
    }

    private static String pointString(float x, float y) {
        return floatString(clamp01(x)) + "," + floatString(clamp01(y));
    }

    private static float clamp01(float value) {
        if (value < 0f) return 0f;
        if (value > 1f) return 1f;
        return value;
    }

    private static String arg(String[] args, int index, String fallback) {
        if (index < 0 || index >= args.length) return fallback;
        String value = args[index];
        return value == null ? fallback : value;
    }

    private static int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (Exception error) {
            return fallback;
        }
    }

    private static int defaultPositive(int value, int fallback) {
        return value > 0 ? value : fallback;
    }

    private static float parseFloat(String value, float fallback) {
        try {
            return Float.parseFloat(value);
        } catch (Exception error) {
            return fallback;
        }
    }

    private static String withDefault(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private static boolean parseBooleanFlag(String value) {
        String normalized = withDefault(value, "0").toLowerCase(Locale.ROOT);
        return "1".equals(normalized) || "true".equals(normalized) || "yes".equals(normalized) || "on".equals(normalized);
    }

    private static int setBit(int value, int bit, boolean enabled) {
        return enabled ? (value | bit) : (value & ~bit);
    }

    private static void fillBytes(byte[] buffer, String value) {
        Arrays.fill(buffer, (byte) 0);
        if (value == null) return;
        byte[] source = value.getBytes(DEVICE_CHARSET);
        System.arraycopy(source, 0, buffer, 0, Math.min(source.length, buffer.length - 1));
    }

    private static void writeIpString(NET_DVR_IPADDR target, String value) {
        if (target == null) return;
        fillBytes(target.sIpV4, withDefault(value, ""));
    }

    private static void writeStructureToUnion(NET_ITC_TRIGGER_PARAM_UNION union, Structure value) {
        byte[] data = value.getPointer().getByteArray(0, value.size());
        union.getPointer().write(0, data, 0, Math.min(data.length, union.size()));
    }

    private static void writeStructureToUnion(NET_ITC_VIDEO_TRIGGER_PARAM_UNION union, Structure value) {
        byte[] data = value.getPointer().getByteArray(0, value.size());
        union.getPointer().write(0, data, 0, Math.min(data.length, union.size()));
    }

    private static void copySingleIoParams(NET_ITC_SINGLEIO_PARAM source, NET_ITC_SINGLEIO_PARAM target) {
        byte originalEnable = target.byEnable;
        byte[] data = source.getPointer().getByteArray(0, source.size());
        target.getPointer().write(0, data, 0, Math.min(data.length, target.size()));
        target.read();
        target.byEnable = originalEnable;
        target.write();
    }

    private static void copyEpoliceLaneParams(NET_ITC_EPOLICE_LANE_PARAM source, NET_ITC_EPOLICE_LANE_PARAM target, boolean protocolOnly) {
        if (protocolOnly) {
            target.bySerialType = source.bySerialType;
            target.struSerialInfo.bySerialProtocol = source.struSerialInfo.bySerialProtocol;
            target.struSerialInfo.byNormalPassProtocol = source.struSerialInfo.byNormalPassProtocol;
            target.struSerialInfo.byInverseProtocol = source.struSerialInfo.byInverseProtocol;
            target.struSerialInfo.bySpeedProtocol = source.struSerialInfo.bySpeedProtocol;
            target.struSerialInfo.write();
            return;
        }
        byte originalEnable = target.byEnable;
        byte originalDriveWay = target.byRelatedDriveWay;
        byte originalOverlayDriveWay = target.byOverlayDriveWay;
        byte[] data = source.getPointer().getByteArray(0, source.size());
        target.getPointer().write(0, data, 0, Math.min(data.length, target.size()));
        target.read();
        target.byEnable = originalEnable;
        target.byRelatedDriveWay = originalDriveWay;
        target.byOverlayDriveWay = originalOverlayDriveWay;
        target.write();
    }

    private static NET_DVR_NETCFG_V30 loadNetworkConfigStruct(int userId) {
        NET_DVR_NETCFG_V30 config = new NET_DVR_NETCFG_V30();
        config.dwSize = config.size();
        config.write();
        IntByReference bytesReturned = new IntByReference();
        boolean ok = sdk.NET_DVR_GetDVRConfig(userId, NET_DVR_GET_NETCFG_V30, 0, config.getPointer(), config.size(), bytesReturned);
        if (!ok) {
            fail("NET_DVR_GetDVRConfig(NETCFG) failed", sdk.NET_DVR_GetLastError());
            return null;
        }
        config.read();
        return config;
    }

    private static NET_DVR_CURTRIGGERMODE loadCurrentTriggerModeStruct(int userId) {
        NET_DVR_CURTRIGGERMODE current = new NET_DVR_CURTRIGGERMODE();
        current.dwSize = current.size();
        current.write();
        IntByReference bytesReturned = new IntByReference();
        boolean ok = sdk.NET_DVR_GetDVRConfig(userId, NET_DVR_GET_CURTRIGGERMODE, 0, current.getPointer(), current.size(), bytesReturned);
        if (!ok) {
            fail("NET_DVR_GetDVRConfig(CURTRIGGERMODE) failed", sdk.NET_DVR_GetLastError());
            return null;
        }
        current.read();
        return current;
    }

    private static boolean setCurrentTriggerModeStruct(int userId, NET_DVR_CURTRIGGERMODE current, int triggerType) {
        current.dwSize = current.size();
        current.dwTriggerType = triggerType;
        int lastError = 0;
        for (int channel : new int[] {1, 0}) {
            current.write();
            boolean ok = sdk.NET_DVR_SetDVRConfig(userId, NET_DVR_SET_CURTRIGGERMODE, channel, current.getPointer(), current.size());
            if (ok) {
                return true;
            }
            lastError = sdk.NET_DVR_GetLastError();
        }
        fail("NET_DVR_SetDVRConfig(CURTRIGGERMODE) failed", lastError);
        return false;
    }

    private static NET_ITC_TRIGGERCFG loadTriggerConfigStruct(int userId, int currentTriggerType) {
        NET_DVR_CURTRIGGERMODE currentMode = loadCurrentTriggerModeStruct(userId);
        int triggerType = (currentMode != null) ? currentMode.dwTriggerType : currentTriggerType;

        // Try EX method with different channel/trigger mode combinations
        int[][] combos = {
            {1, triggerType},
            {0, triggerType},
            {1, 0},
            {0, 0}
        };
        for (int[] combo : combos) {
            NET_ITC_TRIGGERCFG config = new NET_ITC_TRIGGERCFG();
            config.dwSize = config.size();
            config.write();

            NET_DVR_TRIGGER_COND condition = new NET_DVR_TRIGGER_COND();
            condition.dwSize = condition.size();
            condition.dwChannel = combo[0];
            condition.dwTriggerMode = combo[1];
            condition.write();

            IntByReference statusList = new IntByReference(0);
            boolean ok = sdk.NET_DVR_GetDeviceConfig(
                userId, NET_DVR_GET_TRIGGEREX_CFG, 1,
                condition.getPointer(), condition.size(),
                statusList.getPointer(),
                config.getPointer(), config.size()
            );

            if (ok) {
                int status = statusList.getValue();
                if (status == 0 || status == 1) {
                    config.read();
                    return config;
                }
            }
        }

        // Fallback to old method
        return loadTriggerConfigOldMethod(userId, currentTriggerType);
    }

    private static NET_ITC_VIDEO_TRIGGER_PARAM loadVideoTriggerConfigStruct(int userId, int triggerType) {
        int[][] combos = {
            {1, triggerType},
            {0, triggerType},
            {1, 0},
            {0, 0}
        };
        for (int[] combo : combos) {
            NET_ITC_VIDEO_TRIGGER_PARAM config = new NET_ITC_VIDEO_TRIGGER_PARAM();
            config.dwSize = config.size();
            config.dwMode = triggerType;
            config.write();

            NET_ITC_VIDEO_TRIGGER_COND condition = new NET_ITC_VIDEO_TRIGGER_COND();
            condition.dwSize = condition.size();
            condition.dwChannel = combo[0];
            condition.dwTriggerMode = combo[1];
            condition.write();

            IntByReference statusList = new IntByReference(0);
            boolean ok = sdk.NET_DVR_GetDeviceConfig(
                    userId,
                    NET_ITC_GET_VIDEO_TRIGGERCFG,
                    1,
                    condition.getPointer(),
                    condition.size(),
                    statusList.getPointer(),
                    config.getPointer(),
                    config.size()
            );
            if (ok) {
                int status = statusList.getValue();
                if (status == 0 || status == 1) {
                    config.read();
                    return config;
                }
            }
        }
        return null;
    }

    private static boolean saveVideoTriggerConfigStruct(int userId, NET_ITC_VIDEO_TRIGGER_PARAM config) {
        int[][] combos = {
            {1, 0x20000},
            {0, 0x20000},
            {1, 0},
            {0, 0}
        };
        int lastError = 0;
        int lastStatus = 0;
        for (int[] combo : combos) {
            NET_ITC_VIDEO_TRIGGER_COND condition = new NET_ITC_VIDEO_TRIGGER_COND();
            condition.dwSize = condition.size();
            condition.dwChannel = combo[0];
            condition.dwTriggerMode = combo[1];
            condition.write();
            config.write();
            IntByReference statusList = new IntByReference(0);
            boolean ok = sdk.NET_DVR_SetDeviceConfig(
                    userId,
                    NET_ITC_SET_VIDEO_TRIGGERCFG,
                    1,
                    condition.getPointer(),
                    condition.size(),
                    statusList.getPointer(),
                    config.getPointer(),
                    config.size()
            );
            lastError = ok ? 0 : sdk.NET_DVR_GetLastError();
            lastStatus = statusList.getValue();
            if (ok && (lastStatus == 0 || lastStatus == 1)) {
                return true;
            }
        }
        fail("NET_DVR_SetDeviceConfig(VIDEO_TRIGGERCFG) failed/status=" + lastStatus, lastError);
        return false;
    }

    private static NET_ITC_TRIGGERCFG loadTriggerConfigOldMethod(int userId, int currentTriggerType) {
        NET_ITC_TRIGGERCFG config = new NET_ITC_TRIGGERCFG();
        config.dwSize = config.size();
        config.write();
        IntByReference bytesReturned = new IntByReference();
        boolean ok = sdk.NET_DVR_GetDVRConfig(userId, NET_ITC_GET_TRIGGERCFG, 0, config.getPointer(), config.size(), bytesReturned);
        if (!ok) {
            config.write();
            ok = sdk.NET_DVR_GetDVRConfig(userId, NET_ITC_GET_TRIGGERCFG, 1, config.getPointer(), config.size(), bytesReturned);
        }
        if (!ok) {
            fail("NET_DVR_GetDVRConfig(TRIGGERCFG) failed, currentTriggerType=" + currentTriggerType, sdk.NET_DVR_GetLastError());
            return null;
        }
        config.read();
        return config;
    }

    private static NET_DVR_SNAPENABLECFG loadSnapEnableConfigStruct(int userId) {
        NET_DVR_SNAPENABLECFG config = new NET_DVR_SNAPENABLECFG();
        config.dwSize = config.size();
        config.write();
        IntByReference bytesReturned = new IntByReference();
        boolean ok = sdk.NET_DVR_GetDVRConfig(userId, NET_DVR_GET_SNAPENABLECFG, 1, config.getPointer(), config.size(), bytesReturned);
        if (!ok) {
            return null;
        }
        config.read();
        return config;
    }

    private static String trimZero(byte[] value) {
        int end = 0;
        while (end < value.length && value[end] != 0) {
            end++;
        }
        if (end <= 0) return "";
        return new String(value, 0, end, DEVICE_CHARSET).trim();
    }

    private static String ipString(NET_DVR_IPADDR ipAddr) {
        if (ipAddr == null) return "";
        return trimZero(ipAddr.sIpV4);
    }

    private static String macString(byte[] mac) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < mac.length; i++) {
            if (i > 0) sb.append(':');
            sb.append(String.format(Locale.ROOT, "%02X", mac[i] & 0xFF));
        }
        return sb.toString();
    }

    private static int unsignedByte(byte value) {
        return value & 0xFF;
    }

    private static int unsignedShort(short value) {
        return value & 0xFFFF;
    }

    private static String toHex(int value) {
        return String.format(Locale.ROOT, "0x%X", value);
    }

    private static String floatString(float value) {
        return String.format(Locale.ROOT, "%.4f", value);
    }

    private static String boolNullableLabel(Boolean value) {
        if (value == null) return "";
        return value ? "Yes" : "No";
    }

    private static String getEncodingLabel(int code) {
        switch (code) {
            case 0: return "Unknown";
            case 1: return "GB2312";
            case 2: return "GBK";
            case 6: return "UTF-8";
            default: return "Code " + code;
        }
    }

    private static String getNetInterfaceLabel(int code) {
        switch (code) {
            case 1: return "10M half-duplex";
            case 2: return "10M full-duplex";
            case 3: return "100M half-duplex";
            case 4: return "100M full-duplex";
            case 5: return "10/100M auto";
            case 6: return "1000M half-duplex";
            case 7: return "1000M full-duplex";
            case 8: return "10/100/1000M auto";
            default: return "Code " + code;
        }
    }

    private static String getTriggerTypeLabel(int code) {
        switch (code) {
            case 0x1: return "IO speed detector";
            case 0x2: return "Single IO";
            case 0x4: return "RS485 vehicle detector";
            case 0x8: return "RS485 radar";
            case 0x10: return "Virtual coil";
            case 0x20: return "Mixed traffic HVT";
            case 0x40: return "Multi-frame plate";
            case 0x80: return "Video detection";
            case 0x100: return "IO traffic light";
            case 0x200: return "RS485 ePolice";
            case 0x400: return "VIA";
            case 0x10000: return "Card-style ePolice";
            case 0x20000: return "Video ePolice";
            case 0x80000: return "Smart defense";
            case 0x100000: return "IPC HVT";
            case 0x200000: return "Mobile traffic";
            case 0x400000: return "Pedestrian red light";
            case 0x800000: return "No-comity pedestrian";
            default: return "Unknown";
        }
    }

    private static String getRadarTypeLabel(int code) {
        switch (code) {
            case 0: return "No radar";
            case 1: return "Andale";
            case 2: return "Olivia";
            case 3: return "Chuansu microwave";
            case 4: return "Radar IO expander";
            case 5: return "Andale (no controller)";
            case 0xFF: return "Custom";
            default: return "Unknown";
        }
    }

    private static String getTriggerSpareModeLabel(int code) {
        switch (code) {
            case 0: return "Default";
            case 1: return "Virtual coil spare mode";
            case 2: return "Mixed traffic spare mode";
            default: return "";
        }
    }

    private static String getSnapModeLabel(int code) {
        switch (code) {
            case 0: return "Frequency flash";
            case 1: return "Burst flash";
            default: return "";
        }
    }

    private static String getSpeedDetectorLabel(int code) {
        switch (code) {
            case 0: return "Disabled";
            case 1: return "Radar";
            case 2: return "Video";
            default: return "";
        }
    }

    private static String getSceneModeLabel(int code) {
        switch (code) {
            case 0: return "Urban road";
            case 1: return "Community entrance";
            case 2: return "Highway";
            default: return "";
        }
    }

    private static String getCapTypeLabel(int code) {
        switch (code) {
            case 0: return "Default";
            case 1: return "Motor vehicle";
            default: return "";
        }
    }

    private static String getCapModeLabel(int code) {
        switch (code) {
            case 0: return "Video frame capture";
            case 1: return "Interrupted capture";
            case 2: return "Hybrid mode";
            default: return "";
        }
    }

    private static String getSpeedModeLabel(int code) {
        switch (code) {
            case 0: return "No speed";
            case 1: return "Radar speed";
            case 2: return "Video speed";
            default: return "";
        }
    }

    private static String trimZero(byte[] value, int maxLength) {
        if (value == null || value.length == 0) return "";
        int limit = Math.min(value.length, Math.max(maxLength, 0));
        int end = 0;
        while (end < limit && value[end] != 0) {
            end++;
        }
        if (end <= 0) return "";
        return new String(value, 0, end, DEVICE_CHARSET).trim();
    }

    private static String boolLabel(boolean value) {
        return value ? "是" : "否";
    }

    private static boolean containsPictureItem(NET_DVR_PICTURE_NAME rule, int itemCode) {
        if (rule == null) return false;
        for (byte code : rule.byItemOrder) {
            if ((code & 0xFF) == itemCode) {
                return true;
            }
        }
        return false;
    }

    private static String delimiterString(byte delimiter) {
        int value = delimiter & 0xFF;
        if (value == 0) return "";
        return Character.toString((char) value);
    }

    private static String buildPictureNameRule(NET_DVR_PICTURE_NAME rule, String customName) {
        if (rule == null) return "";
        StringBuilder sb = new StringBuilder();
        for (byte code : rule.byItemOrder) {
            int item = code & 0xFF;
            if (item == 0) continue;
            String label = pictureItemLabel(item, customName);
            if (label.isEmpty()) continue;
            if (sb.length() > 0) sb.append(" / ");
            sb.append(label);
        }
        return sb.toString();
    }

    private static String buildPictureNameFormat(NET_DVR_PICTURE_NAME rule, String customName) {
        if (rule == null) return "";
        String delimiter = delimiterString(rule.byDelimiter);
        StringBuilder sb = new StringBuilder();
        for (byte code : rule.byItemOrder) {
            int item = code & 0xFF;
            if (item == 0) continue;
            String label = pictureItemLabel(item, customName);
            if (label.isEmpty()) continue;
            if (sb.length() > 0) sb.append(delimiter);
            sb.append(label);
        }
        return sb.toString();
    }

    private static String buildPictureNameExample(NET_DVR_PICTURE_NAME rule, String customName, String delimiter) {
        if (rule == null) return "";
        StringBuilder sb = new StringBuilder();
        for (byte code : rule.byItemOrder) {
            int item = code & 0xFF;
            if (item == 0) continue;
            String sample = pictureItemExample(item, customName);
            if (sample.isEmpty()) continue;
            if (sb.length() > 0) sb.append(delimiter);
            sb.append(sample);
        }
        return sb.toString();
    }

    private static String pictureItemLabel(int item, String customName) {
        switch (item) {
            case 1: return "设备名";
            case 2: return "设备号";
            case 3: return "设备IP";
            case 4: return "通道名";
            case 5: return "通道号";
            case 6: return "时间";
            case 7: return "卡号";
            case 8: return "车牌号码";
            case 9: return "车牌颜色";
            case 10: return "车道号";
            case 11: return "车辆速度";
            case 12: return "监测点1";
            case 13: return "图片序号";
            case 14: return "车辆序号";
            case 15: return "限速标志";
            case 16: return "国标违法代码";
            case 17: return "路口编号";
            case 18: return "方向编号";
            case 19: return "车辆颜色";
            case 20: return "车牌坐标";
            case 21: return "车辆类型";
            case 22: return "违规类型";
            case 255: return customName == null || customName.isEmpty() ? "自定义" : customName;
            default: return "元素" + item;
        }
    }

    private static String pictureItemExample(int item, String customName) {
        switch (item) {
            case 1: return "Camera";
            case 2: return "0007";
            case 3: return "192.168.1.64";
            case 4: return "Channel1";
            case 5: return "01";
            case 6: return "20260423143030";
            case 7: return "CARD001";
            case 8: return "浙A12345";
            case 9: return "蓝";
            case 10: return "2";
            case 11: return "064";
            case 12: return "070";
            case 13: return "01";
            case 14: return "00025";
            case 15: return "070";
            case 16: return "1302";
            case 17: return "01";
            case 18: return "02";
            case 19: return "白";
            case 20: return "x1y1x2y2";
            case 21: return "小型车";
            case 22: return "正常";
            case 255: return customName == null || customName.isEmpty() ? "CUSTOM" : customName;
            default: return "ITEM" + item;
        }
    }

    private static String dirLevelLabel(int level) {
        switch (level) {
            case 0: return "根目录";
            case 1: return "1级目录";
            case 2: return "2级目录";
            case 3: return "3级目录";
            case 4: return "4级目录";
            default: return "级别" + level;
        }
    }

    private static String dirModeLabel(int mode) {
        switch (mode) {
            case 0x1: return "设备名";
            case 0x2: return "设备号";
            case 0x3: return "设备IP";
            case 0x4: return "监测点";
            case 0x5: return "时间(年月)";
            case 0x6: return "时间(年月日)";
            case 0x7: return "违规类型";
            case 0x8: return "方向";
            case 0x9: return "地点";
            case 0xA: return "通道名";
            case 0xB: return "通道号";
            case 0xC: return "车道号";
            case 0xFF: return "自定义";
            case 0: return "";
            default: return "模式" + mode;
        }
    }

    private static String ftpServerTypeLabel(int code) {
        switch (code) {
            case 0: return "主FTP";
            case 1: return "备FTP";
            default: return "类型" + code;
        }
    }

    private static String uploadDataTypeLabel(int code) {
        switch (code) {
            case 0: return "全部";
            case 1: return "卡口";
            case 2: return "违章";
            default: return "类型" + code;
        }
    }

    private static String buildDirectorySummary(NET_ITC_FTP_CFG config) {
        StringBuilder sb = new StringBuilder();
        int dirLevel = unsignedByte(config.byDirLevel);
        if (dirLevel <= 0) {
            return "根目录";
        }
        String[] labels = {
                dirModeLabel(unsignedByte(config.byTopDirMode)),
                dirModeLabel(unsignedByte(config.bySubDirMode)),
                dirModeLabel(unsignedByte(config.byThreeDirMode)),
                dirModeLabel(unsignedByte(config.byFourDirMode))
        };
        for (int i = 0; i < Math.min(dirLevel, labels.length); i++) {
            String label = labels[i];
            if (label == null || label.isEmpty()) continue;
            if (sb.length() > 0) sb.append(" / ");
            sb.append(label);
        }
        return sb.toString();
    }

    private static String json(String value) {
        String text = value == null ? "" : value;
        return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n");
    }

    private static void success(String json) {
        System.out.println(json);
    }

    private static void fail(String message, int errorCode) {
        System.out.println("{"
                + "\"success\":false,"
                + "\"error\":\"" + json(message) + "\","
                + "\"errorCode\":" + errorCode
                + "}");
    }
}
