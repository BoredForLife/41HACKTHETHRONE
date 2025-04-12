let extractedJSON = null;
    let billChart = null;
    let chartVisible = false;
    let html5QrCode;
    let downloadVisible = false;

    document.addEventListener('DOMContentLoaded', function() {
      // Show the file name when selected
      document.getElementById('imageUpload').addEventListener('change', function(e) {
        const fileName = e.target.files[0]?.name;
        if (fileName) {
          const label = document.querySelector('.file-input-label');
          label.textContent = fileName;
        }
      });
    });

    function toggleDownload() {
      downloadVisible = !downloadVisible;
      document.getElementById('downloadFormat').style.display = downloadVisible ? 'block' : 'none';
    }

    async function processImage() {
      const file = document.getElementById('imageUpload').files[0];
      if (!file) return alert("Please upload a bill image.");

      // Show loader
      document.getElementById('loader').style.display = 'block';
      document.getElementById('emptyState').style.display = 'none';

      const formData = new FormData();
      formData.append("file", file);
      formData.append("language", "eng");
      formData.append("isOverlayRequired", "false");

      try {
        const response = await fetch("https://api.ocr.space/parse/image", {
          method: "POST",
          headers: { apikey: "K89982895488957" },
          body: formData
        });

        const result = await response.json();
        const billText = result.ParsedResults?.[0]?.ParsedText || "";

        const prompt = `You are a bill extraction assistant. Only respond with valid JSON that matches this structure exactly:

{
  "vendor": "Vendor Name",
  "date": "YYYY-MM-DD",
  "total": 123.45,
  "items": [
    { "name": "Item 1", "price": 45.00 },
    { "name": "Item 2", "price": 78.45 }
  ]
}

Now extract from this raw bill text below:

''' 
${billText}
'''

Remember: respond ONLY with valid JSON.`;

        const aiResponse = await fetch("https://api.together.xyz/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": "Bearer 7203c5bdde62866b42dfebb2d9b822de1f738eae4a4da2c982611a515a8fb70c",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3
          })
        });

        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || "No response";

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No valid JSON found");

        extractedJSON = JSON.parse(jsonMatch[0]);
        renderTable(extractedJSON);
        renderChart(extractedJSON.items);
        
        // Show UI elements
        document.getElementById('actionPanel').style.display = 'block';
        document.getElementById('resultPanel').style.display = 'block';
        document.getElementById('qrCodeContainer').style.display = 'block';
        document.getElementById('chartContainer').style.display = 'none';
        chartVisible = false;
        
        // Reset button text
        document.getElementById('chartBtnText').textContent = 'Show Chart';
      } catch (e) {
        alert("Error processing bill. Please try with a clearer image.");
        console.error("Parsing error:", e);
      } finally {
        // Hide loader
        document.getElementById('loader').style.display = 'none';
      }
    }

    function renderTable(data) {
      const summary = document.getElementById("summary");
      summary.innerHTML = `
        <div class="summary-item">
          <div class="summary-label">Vendor</div>
          <div class="summary-value">${data.vendor}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Date</div>
          <div class="summary-value">${data.date}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Total</div>
          <div class="summary-value">₹${data.total}</div>
        </div>
      `;

      const tbody = document.getElementById("tableBody");
      tbody.innerHTML = "";
      data.items.forEach(item => {
        const row = `<tr><td>${item.name}</td><td>₹${item.price}</td></tr>`;
        tbody.innerHTML += row;
      });

      // Update item count pill
      document.getElementById("itemCount").textContent = `${data.items.length} items`;
    }

    function renderChart(items) {
      const type = document.getElementById("chartType").value;
      const labels = items.map(item => item.name);
      const prices = items.map(item => item.price);
      const ctx = document.getElementById("billChart").getContext("2d");

      if (billChart) {
        billChart.destroy();
      }

      // Generate grayscale backgrounds for charts
      let backgroundColor;
      if (type === "bar" || type === "line") {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(74, 74, 74, 0.8)');
        gradient.addColorStop(1, 'rgba(74, 74, 74, 0.2)');
        backgroundColor = gradient;
      } else {
        backgroundColor = generateGrayscaleColors(prices.length);
      }

      let chartData = {
        labels: labels,
        datasets: [{
          label: 'Item Prices (₹)',
          data: prices,
          backgroundColor: backgroundColor,
          borderColor: type === "line" ? 'rgba(74, 74, 74, 1)' : null,
          borderWidth: type === "line" ? 2 : 0,
          tension: type === "line" ? 0.4 : 0,
          fill: type === "line" ? true : null
        }]
      };

      const options = {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFont: {
              family: 'Inter',
              size: 14
            },
            bodyFont: {
              family: 'Inter',
              size: 14
            },
            padding: 12,
            cornerRadius: 6,
            caretSize: 6
          }
        },
        scales: type !== "pie" ? {
          y: { 
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          },
          x: {
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          }
        } : {}
      };

      billChart = new Chart(ctx, {
        type: type,
        data: chartData,
        options
      });
    }

    function toggleChart() {
      chartVisible = !chartVisible;
      document.getElementById('chartContainer').style.display = chartVisible ? 'block' : 'none';
      document.getElementById('chartBtnText').textContent = chartVisible ? 'Hide Chart' : 'Show Chart';
    }

    function handleDownload(format) {
      if (!extractedJSON || !extractedJSON.items) return;

      if (format === "excel") {
        const ws = XLSX.utils.json_to_sheet(extractedJSON.items);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BillData");
        XLSX.writeFile(wb, "Extracted_Bill.xlsx");
      } else if (format === "pdf") {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Add a title
        doc.setFontSize(18);
        doc.setTextColor(74, 74, 74);
        doc.text("Bill Summary", 105, 15, null, null, 'center');
        
        // Add a horizontal line
        doc.setDrawColor(74, 74, 74);
        doc.setLineWidth(0.5);
        doc.line(20, 20, 190, 20);
        
        // Add bill information
        doc.setFontSize(12);
        doc.setTextColor(33, 33, 33);
        doc.text("Vendor: " + extractedJSON.vendor, 20, 30);
        doc.text("Date: " + extractedJSON.date, 20, 40);
        doc.text("Total: ₹" + extractedJSON.total, 20, 50);
        
        // Add items heading
        doc.setFontSize(14);
        doc.setTextColor(74, 74, 74);
        doc.text("Items:", 20, 65);
        
        // Add items
        doc.setFontSize(12);
        doc.setTextColor(33, 33, 33);
        let y = 75;
        extractedJSON.items.forEach((item, index) => {
          doc.text(`${index + 1}. ${item.name} - ₹${item.price}`, 30, y);
          y += 10;
        });
        
        doc.save("Extracted_Bill.pdf");
      }
      
      // Reset dropdown visibility
      toggleDownload();
    }

    function generateGrayscaleColors(count) {
      const colors = [
        'rgba(74, 74, 74, 0.85)',
        'rgba(102, 102, 102, 0.75)',
        'rgba(128, 128, 128, 0.75)',
        'rgba(85, 85, 85, 0.75)',
        'rgba(51, 51, 51, 0.80)',
        'rgba(119, 119, 119, 0.70)',
        'rgba(68, 68, 68, 0.75)',
        'rgba(95, 95, 95, 0.70)'
      ];
      
      let result = [];
      for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
      }
      return result;
    }

    function generateQRCode() {
      document.getElementById("qrcode").innerHTML = "";
      const qrData = JSON.stringify(extractedJSON);
      new QRCode(document.getElementById("qrcode"), {
        text: qrData,
        width: 200,
        height: 200,
        colorDark: "#4a4a4a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }

    function openQRModal() {
      document.getElementById("qrModal").style.display = "flex";
      html5QrCode = new Html5Qrcode("reader");
      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          try {
            const parsed = JSON.parse(decodedText);
            extractedJSON = parsed;
            renderTable(parsed);
            renderChart(parsed.items);
            
            // Show UI elements
            document.getElementById('actionPanel').style.display = 'block';
            document.getElementById('resultPanel').style.display = 'block';
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('qrCodeContainer').style.display = 'block';
            closeQRModal();
          } catch (e) {
            alert("Invalid QR code.");
          }
        },
        (errorMsg) => {}
      );
    }

    function closeQRModal() {
      document.getElementById("qrModal").style.display = "none";
      if (html5QrCode) {
        html5QrCode.stop().then(() => html5QrCode.clear());
      }
    }