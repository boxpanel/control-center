#include <iostream>
#include <cstring>
#include <cstdlib>
#include <string>
#include <sstream>
#include <json/json.h>

// 海康SDK头文件
#include "arm64/HCNetSDK.h"

using namespace std;

// 错误处理
void printError(const string& message) {
    Json::Value error;
    error["error"] = true;
    error["message"] = message;
    Json::StreamWriterBuilder builder;
    builder["indentation"] = "";
    cout << Json::writeString(builder, error) << endl;
}

void printSuccess(const Json::Value& data) {
    Json::Value result;
    result["error"] = false;
    result["data"] = data;
    Json::StreamWriterBuilder builder;
    builder["indentation"] = "";
    cout << Json::writeString(builder, result) << endl;
}

// 解析命令行参数
bool parseArgs(int argc, char* argv[], string& command, string& ip, string& username, 
               string& password, int& port, int& channel) {
    if (argc < 7) {
        printError("参数不足。用法: sdk-bridge <command> <ip> <username> <password> <port> <channel>");
        return false;
    }
    
    command = argv[1];
    ip = argv[2];
    username = argv[3];
    password = argv[4];
    port = atoi(argv[5]);
    channel = atoi(argv[6]);
    
    if (command != "get-ftp" && command != "set-ftp") {
        printError("未知命令。支持的命令: get-ftp, set-ftp");
        return false;
    }
    
    return true;
}

// 获取FTP配置
bool getFtpConfig(LONG lUserID, int channel, Json::Value& ftpConfig) {
    NET_DVR_FTPUPLOADCFG ftpCfg;
    memset(&ftpCfg, 0, sizeof(NET_DVR_FTPUPLOADCFG));
    
    DWORD dwReturn = 0;
    if (!NET_DVR_GetDVRConfig(lUserID, NET_DVR_GET_FTPUPLOAD_CFG, channel, 
                              &ftpCfg, sizeof(NET_DVR_FTPUPLOADCFG), &dwReturn)) {
        DWORD dwError = NET_DVR_GetLastError();
        printError("获取FTP配置失败，错误码: " + to_string(dwError));
        return false;
    }
    
    // 转换为JSON
    ftpConfig["enable"] = ftpCfg.byEnable;
    ftpConfig["host"] = string(ftpCfg.sHost);
    ftpConfig["port"] = ftpCfg.wPort;
    ftpConfig["username"] = string(ftpCfg.sUserName);
    ftpConfig["password"] = string(ftpCfg.sPassword);
    ftpConfig["path"] = string(ftpCfg.sPath);
    ftpConfig["interval"] = ftpCfg.wUploadInterval;
    ftpConfig["mode"] = ftpCfg.byUploadMode;
    
    return true;
}

// 设置FTP配置
bool setFtpConfig(LONG lUserID, int channel, const Json::Value& ftpConfig) {
    NET_DVR_FTPUPLOADCFG ftpCfg;
    memset(&ftpCfg, 0, sizeof(NET_DVR_FTPUPLOADCFG));
    
    // 从JSON填充配置
    if (ftpConfig.isMember("enable")) ftpCfg.byEnable = ftpConfig["enable"].asBool() ? 1 : 0;
    if (ftpConfig.isMember("host")) strncpy(ftpCfg.sHost, ftpConfig["host"].asString().c_str(), sizeof(ftpCfg.sHost) - 1);
    if (ftpConfig.isMember("port")) ftpCfg.wPort = ftpConfig["port"].asInt();
    if (ftpConfig.isMember("username")) strncpy(ftpCfg.sUserName, ftpConfig["username"].asString().c_str(), sizeof(ftpCfg.sUserName) - 1);
    if (ftpConfig.isMember("password")) strncpy(ftpCfg.sPassword, ftpConfig["password"].asString().c_str(), sizeof(ftpCfg.sPassword) - 1);
    if (ftpConfig.isMember("path")) strncpy(ftpCfg.sPath, ftpConfig["path"].asString().c_str(), sizeof(ftpCfg.sPath) - 1);
    if (ftpConfig.isMember("interval")) ftpCfg.wUploadInterval = ftpConfig["interval"].asInt();
    if (ftpConfig.isMember("mode")) ftpCfg.byUploadMode = ftpConfig["mode"].asInt();
    
    if (!NET_DVR_SetDVRConfig(lUserID, NET_DVR_SET_FTPUPLOAD_CFG, channel, 
                              &ftpCfg, sizeof(NET_DVR_FTPUPLOADCFG))) {
        DWORD dwError = NET_DVR_GetLastError();
        printError("设置FTP配置失败，错误码: " + to_string(dwError));
        return false;
    }
    
    return true;
}

int main(int argc, char* argv[]) {
    // 初始化JSON库
    Json::CharReaderBuilder readerBuilder;
    Json::Value configJson;
    
    string command, ip, username, password;
    int port, channel;
    
    if (!parseArgs(argc, argv, command, ip, username, password, port, channel)) {
        return 1;
    }
    
    // 初始化SDK
    if (!NET_DVR_Init()) {
        printError("SDK初始化失败");
        return 1;
    }
    
    // 设置连接超时和重连参数
    NET_DVR_SetConnectTime(2000, 1);
    NET_DVR_SetReconnect(10000, true);
    
    // 登录设备
    NET_DVR_USER_LOGIN_INFO loginInfo;
    NET_DVR_DEVICEINFO_V40 deviceInfo;
    memset(&loginInfo, 0, sizeof(loginInfo));
    memset(&deviceInfo, 0, sizeof(deviceInfo));
    
    strncpy(loginInfo.sDeviceAddress, ip.c_str(), sizeof(loginInfo.sDeviceAddress) - 1);
    loginInfo.wPort = port;
    strncpy(loginInfo.sUserName, username.c_str(), sizeof(loginInfo.sUserName) - 1);
    strncpy(loginInfo.sPassword, password.c_str(), sizeof(loginInfo.sPassword) - 1);
    loginInfo.bUseAsynLogin = false;
    
    LONG lUserID = NET_DVR_Login_V40(&loginInfo, &deviceInfo);
    if (lUserID < 0) {
        DWORD dwError = NET_DVR_GetLastError();
        printError("设备登录失败，错误码: " + to_string(dwError));
        NET_DVR_Cleanup();
        return 1;
    }
    
    bool success = false;
    Json::Value result;
    
    if (command == "get-ftp") {
        success = getFtpConfig(lUserID, channel, result);
        if (success) {
            printSuccess(result);
        }
    } else if (command == "set-ftp") {
        // 读取标准输入中的JSON配置
        string jsonStr;
        string line;
        while (getline(cin, line)) {
            jsonStr += line + "\n";
        }
        
        string parseErrors;
        Json::CharReader* reader = readerBuilder.newCharReader();
        bool parsingSuccessful = reader->parse(jsonStr.c_str(), jsonStr.c_str() + jsonStr.size(), 
                                               &configJson, &parseErrors);
        delete reader;
        
        if (!parsingSuccessful) {
            printError("JSON解析失败: " + parseErrors);
            NET_DVR_Logout(lUserID);
            NET_DVR_Cleanup();
            return 1;
        }
        
        success = setFtpConfig(lUserID, channel, configJson);
        if (success) {
            result["message"] = "FTP配置设置成功";
            printSuccess(result);
        }
    }
    
    // 登出和清理
    NET_DVR_Logout(lUserID);
    NET_DVR_Cleanup();
    
    return success ? 0 : 1;
}