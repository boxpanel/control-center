#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <json/json.h>
#include <string>

#include "arm64/HCNetSDK.h"

using namespace std;

namespace {

string trimCString(const char* value, size_t size) {
    size_t len = 0;
    while (len < size && value[len] != '\0') {
        ++len;
    }
    return string(value, len);
}

string trimByteString(const BYTE* value, size_t size) {
    return trimCString(reinterpret_cast<const char*>(value), size);
}

bool looksLikeIpAddress(const string& value) {
    if (value.empty()) {
        return false;
    }
    return all_of(value.begin(), value.end(), [](unsigned char ch) {
        return isdigit(ch) || ch == '.' || ch == ':';
    });
}

void copyToByteField(BYTE* dest, size_t size, const string& value) {
    memset(dest, 0, size);
    if (size == 0) {
        return;
    }
    strncpy(reinterpret_cast<char*>(dest), value.c_str(), size - 1);
}

Json::Value pictureNameRuleToJson(const NET_DVR_PICTURE_NAME& rule) {
    Json::Value result(Json::objectValue);
    Json::Value items(Json::arrayValue);
    for (int i = 0; i < PICNAME_MAXITEM; ++i) {
        if (rule.byItemOrder[i] != 0) {
            items.append(static_cast<int>(rule.byItemOrder[i]));
        }
    }
    result["items"] = items;
    result["delimiter"] = static_cast<int>(rule.byDelimiter);
    return result;
}

void jsonToPictureNameRule(const Json::Value& input, NET_DVR_PICTURE_NAME& rule) {
    if (input.isMember("delimiter")) {
        rule.byDelimiter = static_cast<BYTE>(input["delimiter"].asInt());
    }
    if (input.isMember("items") && input["items"].isArray()) {
        memset(rule.byItemOrder, 0, sizeof(rule.byItemOrder));
        Json::ArrayIndex count = input["items"].size();
        if (count > PICNAME_MAXITEM) {
            count = PICNAME_MAXITEM;
        }
        for (Json::ArrayIndex i = 0; i < count; ++i) {
            rule.byItemOrder[i] = static_cast<BYTE>(input["items"][i].asInt());
        }
    }
}

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

bool getFtpConfig(LONG userId, int channel, Json::Value& ftpConfig) {
    NET_ITC_FTP_CFG ftpCfg;
    memset(&ftpCfg, 0, sizeof(ftpCfg));
    ftpCfg.dwSize = sizeof(ftpCfg);

    DWORD returned = 0;
    if (!NET_DVR_GetDVRConfig(userId, NET_ITC_GET_FTPCFG, channel, &ftpCfg, sizeof(ftpCfg), &returned)) {
        printError("获取FTP配置失败，错误码: " + to_string(NET_DVR_GetLastError()));
        return false;
    }

    ftpConfig["enable"] = ftpCfg.byEnable;
    ftpConfig["addressType"] = ftpCfg.byAddressType;
    if (ftpCfg.byAddressType == 1) {
        ftpConfig["host"] = trimByteString(ftpCfg.unionServer.struDomain.szDomain, sizeof(ftpCfg.unionServer.struDomain.szDomain));
    } else {
        ftpConfig["host"] = trimCString(ftpCfg.unionServer.struAddrIP.struIp.sIpV4, sizeof(ftpCfg.unionServer.struAddrIP.struIp.sIpV4));
    }
    ftpConfig["port"] = ftpCfg.wFTPPort;
    ftpConfig["username"] = trimByteString(ftpCfg.szUserName, sizeof(ftpCfg.szUserName));
    ftpConfig["password"] = trimByteString(ftpCfg.szPassWORD, sizeof(ftpCfg.szPassWORD));
    ftpConfig["ftpIndex"] = ftpCfg.byRes4;
    ftpConfig["dirLevel"] = ftpCfg.byDirLevel;
    ftpConfig["filterCarPic"] = ftpCfg.byIsFilterCarPic;
    ftpConfig["uploadDataType"] = ftpCfg.byUploadDataType;
    ftpConfig["topDirMode"] = ftpCfg.byTopDirMode;
    ftpConfig["subDirMode"] = ftpCfg.bySubDirMode;
    ftpConfig["threeDirMode"] = ftpCfg.byThreeDirMode;
    ftpConfig["fourDirMode"] = ftpCfg.byFourDirMode;
    ftpConfig["picNameRule"] = pictureNameRuleToJson(ftpCfg.struPicNameRule);
    ftpConfig["picNameCustom"] = trimByteString(ftpCfg.szPicNameCustom, sizeof(ftpCfg.szPicNameCustom));
    ftpConfig["topCustomDir"] = trimByteString(ftpCfg.szTopCustomDir, sizeof(ftpCfg.szTopCustomDir));
    ftpConfig["subCustomDir"] = trimByteString(ftpCfg.szSubCustomDir, sizeof(ftpCfg.szSubCustomDir));
    ftpConfig["threeCustomDir"] = trimByteString(ftpCfg.szThreeCustomDir, sizeof(ftpCfg.szThreeCustomDir));
    ftpConfig["fourCustomDir"] = trimByteString(ftpCfg.szFourCustomDir, sizeof(ftpCfg.szFourCustomDir));

    return true;
}

bool setFtpConfig(LONG userId, int channel, const Json::Value& inputConfig) {
    NET_ITC_FTP_CFG ftpCfg;
    memset(&ftpCfg, 0, sizeof(ftpCfg));
    ftpCfg.dwSize = sizeof(ftpCfg);

    DWORD returned = 0;
    NET_DVR_GetDVRConfig(userId, NET_ITC_GET_FTPCFG, channel, &ftpCfg, sizeof(ftpCfg), &returned);

    if (inputConfig.isMember("enable")) ftpCfg.byEnable = inputConfig["enable"].asBool() ? 1 : 0;
    if (inputConfig.isMember("addressType")) ftpCfg.byAddressType = static_cast<BYTE>(inputConfig["addressType"].asInt());
    if (inputConfig.isMember("host")) {
        const string host = inputConfig["host"].asString();
        if (!inputConfig.isMember("addressType")) {
            ftpCfg.byAddressType = looksLikeIpAddress(host) ? 0 : 1;
        }
        memset(&ftpCfg.unionServer, 0, sizeof(ftpCfg.unionServer));
        if (ftpCfg.byAddressType == 1) {
            copyToByteField(ftpCfg.unionServer.struDomain.szDomain, sizeof(ftpCfg.unionServer.struDomain.szDomain), host);
        } else {
            strncpy(ftpCfg.unionServer.struAddrIP.struIp.sIpV4, host.c_str(), sizeof(ftpCfg.unionServer.struAddrIP.struIp.sIpV4) - 1);
        }
    }
    if (inputConfig.isMember("port")) ftpCfg.wFTPPort = static_cast<WORD>(inputConfig["port"].asInt());
    if (inputConfig.isMember("username")) copyToByteField(ftpCfg.szUserName, sizeof(ftpCfg.szUserName), inputConfig["username"].asString());
    if (inputConfig.isMember("password")) copyToByteField(ftpCfg.szPassWORD, sizeof(ftpCfg.szPassWORD), inputConfig["password"].asString());
    if (inputConfig.isMember("ftpIndex")) ftpCfg.byRes4 = static_cast<BYTE>(inputConfig["ftpIndex"].asInt());
    if (inputConfig.isMember("dirLevel")) ftpCfg.byDirLevel = static_cast<BYTE>(inputConfig["dirLevel"].asInt());
    if (inputConfig.isMember("filterCarPic")) ftpCfg.byIsFilterCarPic = static_cast<BYTE>(inputConfig["filterCarPic"].asInt());
    if (inputConfig.isMember("uploadDataType")) ftpCfg.byUploadDataType = static_cast<BYTE>(inputConfig["uploadDataType"].asInt());
    if (inputConfig.isMember("topDirMode")) ftpCfg.byTopDirMode = static_cast<BYTE>(inputConfig["topDirMode"].asInt());
    if (inputConfig.isMember("subDirMode")) ftpCfg.bySubDirMode = static_cast<BYTE>(inputConfig["subDirMode"].asInt());
    if (inputConfig.isMember("threeDirMode")) ftpCfg.byThreeDirMode = static_cast<BYTE>(inputConfig["threeDirMode"].asInt());
    if (inputConfig.isMember("fourDirMode")) ftpCfg.byFourDirMode = static_cast<BYTE>(inputConfig["fourDirMode"].asInt());
    if (inputConfig.isMember("picNameRule") && inputConfig["picNameRule"].isObject()) {
        jsonToPictureNameRule(inputConfig["picNameRule"], ftpCfg.struPicNameRule);
    }
    if (inputConfig.isMember("picNameCustom")) copyToByteField(ftpCfg.szPicNameCustom, sizeof(ftpCfg.szPicNameCustom), inputConfig["picNameCustom"].asString());
    if (inputConfig.isMember("topCustomDir")) copyToByteField(ftpCfg.szTopCustomDir, sizeof(ftpCfg.szTopCustomDir), inputConfig["topCustomDir"].asString());
    if (inputConfig.isMember("subCustomDir")) copyToByteField(ftpCfg.szSubCustomDir, sizeof(ftpCfg.szSubCustomDir), inputConfig["subCustomDir"].asString());
    if (inputConfig.isMember("threeCustomDir")) copyToByteField(ftpCfg.szThreeCustomDir, sizeof(ftpCfg.szThreeCustomDir), inputConfig["threeCustomDir"].asString());
    if (inputConfig.isMember("fourCustomDir")) copyToByteField(ftpCfg.szFourCustomDir, sizeof(ftpCfg.szFourCustomDir), inputConfig["fourCustomDir"].asString());

    if (!NET_DVR_SetDVRConfig(userId, NET_ITC_SET_FTPCFG, channel, &ftpCfg, sizeof(ftpCfg))) {
        printError("设置FTP配置失败，错误码: " + to_string(NET_DVR_GetLastError()));
        return false;
    }

    return true;
}

} // namespace

int main(int argc, char* argv[]) {
    Json::CharReaderBuilder readerBuilder;
    Json::Value configJson;

    string command;
    string ip;
    string username;
    string password;
    int port = 0;
    int channel = 0;

    if (!parseArgs(argc, argv, command, ip, username, password, port, channel)) {
        return 1;
    }

    if (!NET_DVR_Init()) {
        printError("SDK初始化失败");
        return 1;
    }

    NET_DVR_SetConnectTime(2000, 1);
    NET_DVR_SetReconnect(10000, true);

    NET_DVR_USER_LOGIN_INFO loginInfo;
    NET_DVR_DEVICEINFO_V40 deviceInfo;
    memset(&loginInfo, 0, sizeof(loginInfo));
    memset(&deviceInfo, 0, sizeof(deviceInfo));

    strncpy(loginInfo.sDeviceAddress, ip.c_str(), sizeof(loginInfo.sDeviceAddress) - 1);
    loginInfo.wPort = static_cast<WORD>(port);
    strncpy(loginInfo.sUserName, username.c_str(), sizeof(loginInfo.sUserName) - 1);
    strncpy(loginInfo.sPassword, password.c_str(), sizeof(loginInfo.sPassword) - 1);
    loginInfo.bUseAsynLogin = false;

    LONG userId = NET_DVR_Login_V40(&loginInfo, &deviceInfo);
    if (userId < 0) {
        printError("设备登录失败，错误码: " + to_string(NET_DVR_GetLastError()));
        NET_DVR_Cleanup();
        return 1;
    }

    bool success = false;
    Json::Value result;

    if (command == "get-ftp") {
        success = getFtpConfig(userId, channel, result);
        if (success) {
            printSuccess(result);
        }
    } else if (command == "set-ftp") {
        string jsonStr;
        string line;
        while (getline(cin, line)) {
            jsonStr += line;
            jsonStr += "\n";
        }

        string parseErrors;
        Json::CharReader* reader = readerBuilder.newCharReader();
        const bool parsingSuccessful = reader->parse(
            jsonStr.c_str(),
            jsonStr.c_str() + jsonStr.size(),
            &configJson,
            &parseErrors
        );
        delete reader;

        if (!parsingSuccessful) {
            printError("JSON解析失败: " + parseErrors);
            NET_DVR_Logout(userId);
            NET_DVR_Cleanup();
            return 1;
        }

        success = setFtpConfig(userId, channel, configJson);
        if (success) {
            result["message"] = "FTP配置设置成功";
            printSuccess(result);
        }
    }

    NET_DVR_Logout(userId);
    NET_DVR_Cleanup();

    return success ? 0 : 1;
}
