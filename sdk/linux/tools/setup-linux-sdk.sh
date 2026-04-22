#!/bin/bash

# Linux SDK 设置脚本
# 用于设置海康SDK库路径和环境变量

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(dirname "$SCRIPT_DIR")"
LIBS_DIR="$SDK_ROOT/libs"
INCLUDE_DIR="$SDK_ROOT/include"

echo "=== 海康Linux SDK设置脚本 ==="
echo "SDK根目录: $SDK_ROOT"
echo "库文件目录: $LIBS_DIR"
echo "头文件目录: $INCLUDE_DIR"

# 检查必要的库文件
check_libraries() {
    echo "检查SDK库文件..."
    
    # 核心库
    local core_libs=("libhcnetsdk.so" "libHCCore.so" "libPlayCtrl.so")
    for lib in "${core_libs[@]}"; do
        if [ -f "$LIBS_DIR/$lib" ]; then
            echo "  ✓ $lib"
        else
            echo "  ✗ 缺少核心库: $lib"
            return 1
        fi
    done
    
    # 加密库
    local crypto_libs=("libcrypto.so.3" "libssl.so.3")
    for lib in "${crypto_libs[@]}"; do
        if [ -f "$LIBS_DIR/$lib" ]; then
            echo "  ✓ $lib"
        else
            echo "  ✗ 缺少加密库: $lib"
        fi
    done
    
    echo "库文件检查完成"
    return 0
}

# 设置库路径
setup_library_path() {
    echo "设置库路径..."
    
    # 将SDK库目录添加到LD_LIBRARY_PATH
    if [[ ":$LD_LIBRARY_PATH:" != *":$LIBS_DIR:"* ]]; then
        export LD_LIBRARY_PATH="$LIBS_DIR:$LD_LIBRARY_PATH"
        echo "已添加 $LIBS_DIR 到 LD_LIBRARY_PATH"
    else
        echo "$LIBS_DIR 已在 LD_LIBRARY_PATH 中"
    fi
    
    # 创建库链接（如果需要）
    create_library_links
    
    echo "库路径设置完成"
}

# 创建库链接
create_library_links() {
    echo "创建库链接..."
    
    # 为常用的库创建符号链接
    local links=(
        "libcrypto.so.3:libcrypto.so"
        "libssl.so.3:libssl.so"
        "libiconv.so.2:libiconv.so"
        "libz.so:libz.so.1"
    )
    
    for link_pair in "${links[@]}"; do
        IFS=':' read -r source target <<< "$link_pair"
        if [ -f "$LIBS_DIR/$source" ] && [ ! -f "$LIBS_DIR/$target" ]; then
            ln -sf "$source" "$LIBS_DIR/$target"
            echo "  创建链接: $source -> $target"
        fi
    done
}

# 检查Java环境
check_java_environment() {
    echo "检查Java环境..."
    
    if command -v java &> /dev/null; then
        JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d '"' -f 2)
        echo "  ✓ Java已安装: $JAVA_VERSION"
        
        # 检查JNA
        if java -cp .:jna.jar com.sun.jna.Native 2>&1 | grep -q "JNA native library"; then
            echo "  ✓ JNA库可用"
            return 0
        else
            echo "  ⚠ JNA库可能未安装"
            return 1
        fi
    else
        echo "  ✗ Java未安装"
        return 1
    fi
}

# 编译Java工具
compile_java_tools() {
    echo "编译Java工具..."
    
    local java_tool="$SCRIPT_DIR/../tools/HikvisionSdkTool.java"
    local class_dir="$SCRIPT_DIR/../tools"
    
    if [ -f "$java_tool" ]; then
        echo "找到Java工具源文件: $java_tool"
        
        # 编译Java工具
        if javac -cp "$class_dir:$LIBS_DIR/*" -d "$class_dir" "$java_tool" 2>/dev/null; then
            echo "  ✓ Java工具编译成功"
            return 0
        else
            echo "  ✗ Java工具编译失败"
            echo "  尝试使用简化编译..."
            
            # 尝试简化编译
            if javac -d "$class_dir" "$java_tool" 2>/dev/null; then
                echo "  ✓ Java工具简化编译成功"
                return 0
            else
                echo "  ✗ Java工具编译完全失败"
                return 1
            fi
        fi
    else
        echo "  ⚠ 未找到Java工具源文件"
        return 1
    fi
}

# 测试SDK功能
test_sdk_function() {
    echo "测试SDK功能..."
    
    # 测试库加载
    if ldconfig -p | grep -q "libhcnetsdk"; then
        echo "  ✓ libhcnetsdk 库已注册"
    else
        echo "  ⚠ libhcnetsdk 库未在系统库中注册"
    fi
    
    # 测试库文件可访问性
    if [ -r "$LIBS_DIR/libhcnetsdk.so" ]; then
        echo "  ✓ libhcnetsdk.so 可读"
    else
        echo "  ✗ libhcnetsdk.so 不可读"
        return 1
    fi
    
    # 测试头文件
    if [ -r "$INCLUDE_DIR/HCNetSDK.h" ]; then
        echo "  ✓ HCNetSDK.h 头文件可读"
    else
        echo "  ✗ HCNetSDK.h 头文件不可读"
        return 1
    fi
    
    echo "SDK功能测试完成"
    return 0
}

# 生成环境配置
generate_env_config() {
    echo "生成环境配置..."
    
    local env_file="$SDK_ROOT/sdk-env.sh"
    
    cat > "$env_file" << EOF
#!/bin/bash
# 海康SDK环境配置
# 生成时间: $(date)

export HIKVISION_SDK_ROOT="$SDK_ROOT"
export HIKVISION_LIB_PATH="$LIBS_DIR"
export HIKVISION_INCLUDE_PATH="$INCLUDE_DIR"

# 添加到库路径
if [[ ":\$LD_LIBRARY_PATH:" != *":\$HIKVISION_LIB_PATH:"* ]]; then
    export LD_LIBRARY_PATH="\$HIKVISION_LIB_PATH:\$LD_LIBRARY_PATH"
fi

# Java类路径
if [[ ":\$CLASSPATH:" != *":\$HIKVISION_SDK_ROOT:"* ]]; then
    export CLASSPATH="\$HIKVISION_SDK_ROOT:\$CLASSPATH"
fi

echo "海康SDK环境已设置"
echo "库路径: \$HIKVISION_LIB_PATH"
echo "头文件路径: \$HIKVISION_INCLUDE_PATH"
EOF
    
    chmod +x "$env_file"
    echo "  ✓ 环境配置文件已生成: $env_file"
    echo "  使用命令加载环境: source $env_file"
}

# 主函数
main() {
    echo "开始设置海康Linux SDK..."
    
    # 检查库文件
    if ! check_libraries; then
        echo "错误: 缺少必要的库文件"
        exit 1
    fi
    
    # 设置库路径
    setup_library_path
    
    # 检查Java环境
    if check_java_environment; then
        # 编译Java工具
        compile_java_tools
    else
        echo "警告: Java环境不完整，SDK的Java功能可能受限"
    fi
    
    # 测试SDK功能
    if test_sdk_function; then
        echo "✓ SDK功能测试通过"
    else
        echo "警告: SDK功能测试未完全通过"
    fi
    
    # 生成环境配置
    generate_env_config
    
    echo ""
    echo "=== 设置完成 ==="
    echo "1. 使用以下命令加载SDK环境:"
    echo "   source $SDK_ROOT/sdk-env.sh"
    echo ""
    echo "2. 验证SDK环境:"
    echo "   ldd $LIBS_DIR/libhcnetsdk.so"
    echo ""
    echo "3. 测试Java工具:"
    echo "   java -cp $SDK_ROOT/tools HikvisionSdkTool"
}

# 执行主函数
main "$@"