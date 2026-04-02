const fs = require('fs');
const sourceMap = require('source-map');

// 读取 Source Map 文件
const mapContent = fs.readFileSync('./cli.js.map', 'utf8');
const map = JSON.parse(mapContent);

// 打印 Source Map 的基本信息
console.log('Source Map 版本:', map.version);
console.log('源文件数量:', map.sources.length);
console.log('是否包含源代码:', !!map.sourcesContent);

// 查看源文件路径，筛选出可能是项目核心代码的文件
console.log('\n源文件路径列表:');
const projectFiles = [];
const lodashFiles = [];

for (let i = 0; i < map.sources.length; i++) {
    const sourcePath = map.sources[i];
    if (sourcePath.includes('lodash') || sourcePath.includes('_')) {
        lodashFiles.push(sourcePath);
    } else {
        projectFiles.push({ index: i, path: sourcePath });
    }
}

console.log('\n可能的项目核心文件:');
projectFiles.forEach(file => {
    console.log(`${file.index}: ${file.path}`);
});

console.log('\nLodash 库文件数量:', lodashFiles.length);

// 创建输出目录
const outputDir = './project-source';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// 导出项目核心代码文件
if (map.sourcesContent && map.sourcesContent.length > 0 && projectFiles.length > 0) {
    console.log('\n导出项目核心代码文件...');
    
    for (const file of projectFiles) {
        const sourceContent = map.sourcesContent[file.index];
        
        // 生成文件名
        let fileName = file.path;
        // 移除路径前缀，只保留文件名
        fileName = fileName.split('/').pop();
        // 如果没有文件名，使用索引作为文件名
        if (!fileName) {
            fileName = `project-${file.index}.js`;
        }
        
        // 写入文件
        const outputPath = `${outputDir}/${fileName}`;
        fs.writeFileSync(outputPath, sourceContent);
        console.log(`导出文件: ${outputPath}`);
    }
    
    console.log(`\n已导出 ${projectFiles.length} 个项目核心代码文件到 ${outputDir} 目录`);
} else {
    console.log('\n没有找到项目核心代码文件或 Source Map 文件中不包含源代码');
}

console.log('\n解析完成');