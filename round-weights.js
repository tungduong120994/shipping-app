const fs = require('fs');
const path = require('path');

// Đọc file CSV
const csvPath = path.join(__dirname, 'data.csv');
let data = fs.readFileSync(csvPath, 'utf8');

// Hàm làm tròn số đến 1 chữ số thập phân
function roundToOneDecimal(value) {
  // Chuyển dấu phẩy thành dấu chấm nếu cần
  const num = parseFloat(value.replace(',', '.'));
  
  // Làm tròn đến 1 chữ số thập phân
  const rounded = Math.round(num * 10) / 10;
  
  // Chuyển back thành dạng Vietnamese (dấu phẩy làm dấu thập phân)
  return rounded.toString().replace('.', ',');
}

// Regex để tìm tất cả các giá trị trọng lượng (số có dấu phẩy hoặc số nguyên trong ngoặc)
// Pattern: "số,số" hoặc "số" (chỉ trong ngoặc kép)
const regex = /"([0-9]+(?:,[0-9]+)?)"/g;

let replacementCount = 0;

// Thay thế tất cả giá trị trọng lượng
const newData = data.replace(regex, (match, value) => {
  // Kiểm tra xem có phải là số hay không
  if (/^[0-9]+(?:,[0-9]+)?$/.test(value)) {
    const rounded = roundToOneDecimal(value);
    replacementCount++;
    
    // Chỉ in ra 10 lần thay thế đầu tiên để debug
    if (replacementCount <= 10) {
      console.log(`${value} → ${rounded}`);
    }
    
    return `"${rounded}"`;
  }
  return match;
});

// Ghi lại file
fs.writeFileSync(csvPath, newData, 'utf8');

console.log(`\n✅ Hoàn tất! Đã làm tròn ${replacementCount} giá trị trọng lượng đến 1 chữ số thập phân.`);
