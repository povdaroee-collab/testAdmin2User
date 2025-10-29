// --- នាំចូល Firebase SDKs ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, getDocs, Timestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"; // Added getDocs

// Enable Firestore debug logging
setLogLevel('debug');

// --- ការកំណត់រចនាសម្ព័ន្ធ Firebase (ដូចគ្នានឹងកម្មវិធី User) ---
const firebaseConfig = {
    apiKey: "AIzaSyDjr_Ha2RxOWEumjEeSdluIW3JmyM76mVk",
    authDomain: "dipermisstion.firebaseapp.com",
    projectId: "dipermisstion",
    storageBucket: "dipermisstion.firebasestorage.app",
    messagingSenderId: "512999406057",
    appId: "1:512999406057:web:953a281ab9dde7a9a0f378",
    measurementId: "G-KDPHXZ7H4B"
};

// --- ផ្លូវ (Path) ទៅកាន់ Collections ---
let leaveRequestsCollectionPath, outRequestsCollectionPath;

// --- Global Variables ---
let db, auth;
let tabLeave, tabOut, pageLeave, pageOut, leaveListContainer, outListContainer, leavePlaceholder, outPlaceholder, loadingIndicator;
let openFilterBtn, filterModal, filterMonth, filterYear, applyFilterBtn, cancelFilterBtn;

// --- Variables ថ្មី​សម្រាប់ Download ---
let openDownloadBtn, downloadModal, cancelDownloadBtn, downloadStatus;
let downloadStartDate, downloadEndDate, downloadSelectMonth, downloadSelectYear;
let downloadLeaveBtn, downloadOutBtn;
let isDownloading = false; // Flag to prevent multiple downloads

let currentFilterMonth, currentFilterYear;
let leaveUnsubscribe = null;
let outUnsubscribe = null;

// --- Date Helper Functions ---
function formatFirestoreTimestamp(timestamp, format = 'HH:mm dd/MM/yyyy') {
    let date;
    if (!timestamp) return "";
    if (timestamp instanceof Date) date = timestamp;
    else if (timestamp.toDate) date = timestamp.toDate();
    else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
        if (isNaN(date.getTime())) return "";
    } else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else return "";

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    if (format === 'HH:mm' || format === 'time') return `${hours}:${minutes}`;
    if (format === 'dd/MM/yyyy' || format === 'date') return `${day}/${month}/${year}`;
    if (format === 'yyyy-mm-dd') return `${year}-${month}-${day}`; // Format សម្រាប់ input date
    return `${hours}:${minutes} ${day}/${month}/${year}`;
}

// Function to get today's date in yyyy-mm-dd format
function getTodayInputDate() {
    return formatFirestoreTimestamp(new Date(), 'yyyy-mm-dd');
}


// --- App Initialization ---
document.addEventListener('DOMContentLoaded', async () => {

    // --- កំណត់ Element References ---
    tabLeave = document.getElementById('tab-leave');
    tabOut = document.getElementById('tab-out');
    pageLeave = document.getElementById('page-leave');
    pageOut = document.getElementById('page-out');
    leaveListContainer = document.getElementById('leave-list-container');
    outListContainer = document.getElementById('out-list-container');
    leavePlaceholder = document.getElementById('leave-placeholder');
    outPlaceholder = document.getElementById('out-placeholder');
    loadingIndicator = document.getElementById('loading-indicator');
    openFilterBtn = document.getElementById('open-filter-btn');
    filterModal = document.getElementById('filter-modal');
    filterMonth = document.getElementById('filter-month');
    filterYear = document.getElementById('filter-year');
    applyFilterBtn = document.getElementById('apply-filter-btn');
    cancelFilterBtn = document.getElementById('cancel-filter-btn');

    // --- Element References ថ្មី​សម្រាប់ Download ---
    openDownloadBtn = document.getElementById('open-download-btn');
    downloadModal = document.getElementById('download-modal');
    cancelDownloadBtn = document.getElementById('cancel-download-btn');
    downloadStatus = document.getElementById('download-status');
    downloadStartDate = document.getElementById('download-start-date');
    downloadEndDate = document.getElementById('download-end-date');
    downloadSelectMonth = document.getElementById('download-select-month');
    downloadSelectYear = document.getElementById('download-select-year');
    downloadLeaveBtn = document.getElementById('download-leave-btn');
    downloadOutBtn = document.getElementById('download-out-btn');


    // --- កំណត់ Filter ដំបូង (ខែ និង ឆ្នាំ បច្ចុប្បន្ន) ---
    const now = new Date();
    currentFilterMonth = now.getMonth(); // 0-11
    currentFilterYear = now.getFullYear();

    // Update <select> ឲ្យ​បង្ហាញ​តម្លៃ​បច្ចុប្បន្ន (សម្រាប់ Filter)
    filterMonth.value = currentFilterMonth;
    // កំណត់ឆ្នាំបច្ចុប្បន្ន (ប្រសិនបើឆ្នាំបច្ចុប្បន្នមិនមានក្នុង list សូមបន្ថែម)
    addYearOptionIfNeeded(filterYear, currentFilterYear);
    filterYear.value = currentFilterYear;

    // --- Populate Download Modal Selects ---
    populateMonthSelect(downloadSelectMonth, currentFilterMonth);
    populateYearSelect(downloadSelectYear, currentFilterYear);
    downloadStartDate.value = getTodayInputDate(); // Set default date
    downloadEndDate.value = getTodayInputDate();   // Set default date


    // --- កំណត់ Event Listeners ---
    tabLeave.addEventListener('click', () => showTab('leave'));
    tabOut.addEventListener('click', () => showTab('out'));
    openFilterBtn.addEventListener('click', openFilterModal);
    cancelFilterBtn.addEventListener('click', closeFilterModal);
    applyFilterBtn.addEventListener('click', applyFilter);

    // --- Event Listeners ថ្មី​សម្រាប់ Download ---
    openDownloadBtn.addEventListener('click', openDownloadModal);
    cancelDownloadBtn.addEventListener('click', closeDownloadModal);
    downloadLeaveBtn.addEventListener('click', () => handleDownload('leave'));
    downloadOutBtn.addEventListener('click', () => handleDownload('out'));


    // --- Firebase Initialization & Auth ---
    try {
        if (!firebaseConfig.projectId) throw new Error("projectId not provided in firebase.initializeApp.");

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        leaveRequestsCollectionPath = `/artifacts/${canvasAppId}/public/data/leave_requests`;
        outRequestsCollectionPath = `/artifacts/${canvasAppId}/public/data/out_requests`;

        console.log("Admin App: Using Firestore Leave Path:", leaveRequestsCollectionPath);
        console.log("Admin App: Using Firestore Out Path:", outRequestsCollectionPath);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("Admin App: Firebase Auth state changed. User UID:", user.uid);
                // ចាប់ផ្តើមទាញទិន្នន័យដំបូង
                fetchFilteredData();
            } else {
                console.log("Admin App: No user signed in. Attempting anonymous sign-in...");
                signInAnonymously(auth).catch(anonError => {
                    console.error("Admin App: Error during automatic anonymous sign-in:", anonError);
                });
            }
        });

        // ព្យាយាម Sign In ជា Anonymous នៅពេលបើកកម្មវិធី
        await signInAnonymously(auth);

    } catch (e) {
        console.error("Admin App: Firebase Initialization/Auth Error:", e);
        if(loadingIndicator) loadingIndicator.innerHTML = `<p class="text-red-600 font-semibold">Error: មិនអាចតភ្ជាប់ Firebase បានទេ។ ${e.message}</p>`;
    }
});

// --- មុខងារ​ប្ដូរ Tab ---
function showTab(tabName) {
    if (tabName === 'leave') {
        pageLeave.classList.remove('hidden');
        pageOut.classList.add('hidden');
        tabLeave.classList.add('active');
        tabOut.classList.remove('active');
    } else {
        pageLeave.classList.add('hidden');
        pageOut.classList.remove('hidden');
        tabLeave.classList.remove('active');
        tabOut.classList.add('active');
    }
}

// --- មុខងារ​ទាញ​ទិន្នន័យ​តាម Filter (សម្រាប់បង្ហាញលើអេក្រង់) ---
function fetchFilteredData() {
    console.log(`Fetching display data for: ${currentFilterMonth + 1}/${currentFilterYear}`);

    // បង្ហាញ Loading
    loadingIndicator.classList.remove('hidden');
    leavePlaceholder.classList.add('hidden');
    outPlaceholder.classList.add('hidden');
    leaveListContainer.innerHTML = '';
    outListContainer.innerHTML = '';

    // បញ្ឈប់ Listener ចាស់ (ប្រសិនបើមាន)
    if (leaveUnsubscribe) leaveUnsubscribe();
    if (outUnsubscribe) outUnsubscribe();

    // គណនា​ថ្ងៃ​ចាប់ផ្ដើម និង​ថ្ងៃ​បញ្ចប់​នៃ​ខែ​ដែល​បាន​ជ្រើសរើស (សម្រាប់ onSnapshot)
    try {
        const startDate = new Date(currentFilterYear, currentFilterMonth, 1);
        const endDate = new Date(currentFilterYear, currentFilterMonth + 1, 1);

        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        // --- បង្កើត Query សម្រាប់ ច្បាប់ឈប់សម្រាក (onSnapshot) ---
        const leaveQuery = query(
            collection(db, leaveRequestsCollectionPath),
            where("status", "==", "approved"),
            where("requestedAt", ">=", startTimestamp), // Filter by requestedAt for consistency
            where("requestedAt", "<", endTimestamp)
        );

        leaveUnsubscribe = onSnapshot(leaveQuery, (snapshot) => {
            console.log(`Received LEAVE snapshot. Size: ${snapshot.size}`);
            renderHistoryList(snapshot, leaveListContainer, leavePlaceholder, 'leave');
            loadingIndicator.classList.add('hidden'); // លាក់ Loading នៅពេលទិន្នន័យដំបូងមកដល់
        }, (error) => {
            console.error("Error listening to LEAVE history:", error);
            leavePlaceholder.innerHTML = `<p class="text-red-500">Error: មិនអាចទាញយកប្រវត្តិបានទេ ${error.message}</p>`;
            leavePlaceholder.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
        });

        // --- បង្កើត Query សម្រាប់ ច្បាប់ចេញក្រៅ (onSnapshot) ---
        const outQuery = query(
            collection(db, outRequestsCollectionPath),
            where("status", "==", "approved"),
            where("requestedAt", ">=", startTimestamp), // Filter by requestedAt for consistency
            where("requestedAt", "<", endTimestamp)
        );

        outUnsubscribe = onSnapshot(outQuery, (snapshot) => {
            console.log(`Received OUT snapshot. Size: ${snapshot.size}`);
            renderHistoryList(snapshot, outListContainer, outPlaceholder, 'out');
            loadingIndicator.classList.add('hidden');
        }, (error) => {
            console.error("Error listening to OUT history:", error);
            outPlaceholder.innerHTML = `<p class="text-red-500">Error: មិនអាចទាញយកប្រវត្តិបានទេ ${error.message}</p>`;
            outPlaceholder.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
        });

    } catch (e) {
        console.error("Error creating date query for display:", e);
        loadingIndicator.innerHTML = `<p class="text-red-600 font-semibold">Error: ${e.message}</p>`;
    }
}

// --- មុខងារ​បង្ហាញ Card ក្នុង​បញ្ជី (ដូចមុន) ---
function renderHistoryList(snapshot, container, placeholder, type) {
    if (!container || !placeholder) return;

    if (snapshot.empty) {
        placeholder.classList.remove('hidden');
        container.innerHTML = '';
    } else {
        placeholder.classList.add('hidden');
        container.innerHTML = '';

        const requests = [];
        snapshot.forEach(doc => requests.push(doc.data()));

        // រៀបចំតាមថ្ងៃស្នើសុំ (ថ្មីមុន)
        requests.sort((a, b) => {
            const timeA = a.requestedAt?.toMillis() ?? 0;
            const timeB = b.requestedAt?.toMillis() ?? 0;
            return timeB - timeA;
        });

        requests.forEach(request => {
            container.innerHTML += renderAdminCard(request, type);
        });
    }
}

// --- មុខងារ​បង្កើត HTML សម្រាប់ Card នីមួយៗ (ដូចមុន) ---
function renderAdminCard(request, type) {
    if (!request || !request.requestId) return '';

    const dateString = (request.startDate === request.endDate)
        ? request.startDate
        : (request.startDate && request.endDate ? `${request.startDate} ដល់ ${request.endDate}` : 'N/A');

    const decisionTimeText = formatFirestoreTimestamp(request.decisionAt, 'HH:mm dd/MM/yyyy');

    let returnInfo = '';
    if (type === 'out' && request.returnStatus === 'បានចូលមកវិញ') {
        returnInfo = `
            <div class="mt-3 pt-3 border-t border-dashed border-gray-200">
                <p class="text-sm font-semibold text-green-700">✔️ បានចូលមកវិញ</p>
                <p class="text-sm text-gray-600">នៅម៉ោង: ${request.returnedAt || 'N/A'}</p>
            </div>
        `;
    } else if (type === 'out' && request.status === 'approved' && request.returnStatus !== 'បានចូលមកវិញ') {
         returnInfo = `
             <div class="mt-3 pt-3 border-t border-dashed border-gray-200">
                <p class="text-sm font-medium text-orange-600">🚶 កំពុងនៅក្រៅ</p>
            </div>
        `;
    }

    return `
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-semibold text-gray-800">${request.name || 'N/A'} (${request.userId || 'N/A'})</p>
                    <p class="text-sm text-gray-500">${request.department || 'N/A'}</p>
                </div>
                <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">បានយល់ព្រម</span>
            </div>

            <hr class="my-3 border-gray-100">

            <div class="space-y-1 text-sm">
                <p><b>រយៈពេល:</b> ${request.duration || 'N/A'}</p>
                <p><b>កាលបរិច្ឆេទ:</b> ${dateString}</p>
                <p><b>មូលហេតុ:</b> ${request.reason || 'មិនបានបញ្ជាក់'}</p>
            </div>

            <div class="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                <p>អនុម័ត: ${decisionTimeText}</p>
                <p class="mt-1">ID: ${request.requestId}</p>
            </div>

            ${returnInfo}
        </div>
    `;
}

// --- មុខងារ​សម្រាប់ Filter Modal (ដូចមុន) ---
function openFilterModal() {
    filterMonth.value = currentFilterMonth;
    filterYear.value = currentFilterYear;
    filterModal.classList.remove('hidden');
}

function closeFilterModal() {
    filterModal.classList.add('hidden');
}

function applyFilter() {
    currentFilterMonth = parseInt(filterMonth.value);
    currentFilterYear = parseInt(filterYear.value);
    closeFilterModal();
    fetchFilteredData(); // ទាញទិន្នន័យសម្រាប់បង្ហាញឡើងវិញ
}

// --- មុខងារ​សម្រាប់ Download Modal ---
function openDownloadModal() {
    // កំណត់ Default Values
    document.getElementById('download-range').checked = true; // Default to date range
    downloadStartDate.value = getTodayInputDate();
    downloadEndDate.value = getTodayInputDate();
    downloadSelectMonth.value = currentFilterMonth; // Use current display month/year
    downloadSelectYear.value = currentFilterYear;
    downloadStatus.textContent = ''; // Clear status
    downloadLeaveBtn.disabled = false;
    downloadOutBtn.disabled = false;
    isDownloading = false;
    downloadModal.classList.remove('hidden');
}

function closeDownloadModal() {
    downloadModal.classList.add('hidden');
}

// --- មុខងារ​ស្នូល​សម្រាប់ Download ---
async function handleDownload(type) { // type can be 'leave' or 'out'
    // --- *** LOGGING START *** ---
    console.log(`handleDownload called for type: ${type}`);
    if (isDownloading) {
        console.log("Download already in progress. Aborting.");
        return;
    }
    // --- *** LOGGING END *** ---

    isDownloading = true;
    downloadLeaveBtn.disabled = true;
    downloadOutBtn.disabled = true;
    downloadStatus.textContent = 'កំពុង​ទាញ​ទិន្ននន័យ...';
    downloadStatus.classList.remove('text-red-500', 'text-green-500');
    downloadStatus.classList.add('text-blue-500');

    const downloadType = document.querySelector('input[name="download-type"]:checked').value;
    const collectionPath = type === 'leave' ? leaveRequestsCollectionPath : outRequestsCollectionPath;
    const fileNameBase = type === 'leave' ? 'Leave_Requests' : 'Out_Requests';

    // --- *** LOGGING START *** ---
    console.log(`Selected download type: ${downloadType}`);
    // --- *** LOGGING END *** ---

    let q; // Firestore Query
    let fileNameSuffix = '';

    try {
        // --- កំណត់ Query ដោយ​ផ្អែក​លើ​ជម្រើស Download ---
        if (downloadType === 'range') {
            const startDateStr = downloadStartDate.value;
            const endDateStr = downloadEndDate.value;
             // --- *** LOGGING START *** ---
            console.log(`Date range selected: ${startDateStr} to ${endDateStr}`);
            // --- *** LOGGING END *** ---
            if (!startDateStr || !endDateStr) throw new Error("សូម​ជ្រើសរើស​ថ្ងៃ​ចាប់ផ្តើម និង​បញ្ចប់");

            // +1 day to endDate to include the whole day
            const end = new Date(endDateStr);
            end.setDate(end.getDate() + 1);

            const startTimestamp = Timestamp.fromDate(new Date(startDateStr));
            const endTimestamp = Timestamp.fromDate(end);
            // --- *** LOGGING START *** ---
            console.log("Timestamps for query:", startTimestamp, endTimestamp);
            // --- *** LOGGING END *** ---

            // Query based on 'decisionAt' for approved requests within the date range
            q = query(
                collection(db, collectionPath),
                where("status", "==", "approved"),
                where("decisionAt", ">=", startTimestamp),
                where("decisionAt", "<", endTimestamp)
            );
            fileNameSuffix = `_${startDateStr}_to_${endDateStr}`;

        } else if (downloadType === 'month') {
            const month = parseInt(downloadSelectMonth.value);
            const year = parseInt(downloadSelectYear.value);
            // --- *** LOGGING START *** ---
            console.log(`Month/Year selected: ${month + 1}/${year}`);
            // --- *** LOGGING END *** ---

            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 1);

            const startTimestamp = Timestamp.fromDate(startDate);
            const endTimestamp = Timestamp.fromDate(endDate);
             // --- *** LOGGING START *** ---
            console.log("Timestamps for query:", startTimestamp, endTimestamp);
            // --- *** LOGGING END *** ---

            // Query based on 'decisionAt' for approved requests within the selected month/year
            q = query(
                collection(db, collectionPath),
                where("status", "==", "approved"),
                where("decisionAt", ">=", startTimestamp),
                where("decisionAt", "<", endTimestamp)
            );
            fileNameSuffix = `_${String(month + 1).padStart(2, '0')}-${year}`;

        } else { // downloadType === 'all'
            // --- *** LOGGING START *** ---
            console.log("All data selected.");
             // --- *** LOGGING END *** ---
             q = query(
                collection(db, collectionPath),
                where("status", "==", "approved")
            );
            fileNameSuffix = '_All_Approved';
        }

        console.log(`Downloading ${type} data with type: ${downloadType}`);
        downloadStatus.textContent = 'កំពុង​ប្រមូល​ទិន្នន័យ...';

        // --- ទាញ​ទិន្នន័យ​ទាំង​អស់ (ប្រើ getDocs) ---
        // --- *** LOGGING START *** ---
        console.log("Executing Firestore getDocs query...");
        // --- *** LOGGING END *** ---
        const querySnapshot = await getDocs(q);
        // --- *** LOGGING START *** ---
        console.log(`Firestore query completed. Found ${querySnapshot.size} documents.`);
        // --- *** LOGGING END *** ---
        const dataToExport = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // --- *** LOGGING START *** ---
            // console.log("Processing doc:", doc.id, data); // Log each document if needed
            // --- *** LOGGING END *** ---
            // រៀបចំ​ទិន្នន័យ​សម្រាប់ Excel
            const formattedData = {
                "ID ស្នើសុំ": data.requestId || '',
                "ID បុគ្គលិក": data.userId || '',
                "ឈ្មោះ": data.name || '',
                "ផ្នែក": data.department || '',
                "រយៈពេល": data.duration || '',
                "មូលហេតុ": data.reason || '',
                "ថ្ងៃចាប់ផ្តើម": data.startDate || '',
                "ថ្ងៃបញ្ចប់": data.endDate || '',
                "ស្នើសុំនៅ": formatFirestoreTimestamp(data.requestedAt, 'HH:mm dd/MM/yyyy'),
                "អនុម័តនៅ": formatFirestoreTimestamp(data.decisionAt, 'HH:mm dd/MM/yyyy'),
            };
            // បន្ថែម​ព័ត៌មាន​ចូល​វិញ (សម្រាប់​តែច្បាប់​ចេញ​ក្រៅ)
            if (type === 'out') {
                formattedData["ស្ថានភាពចូលវិញ"] = data.returnStatus === 'បានចូលមកវិញ' ? 'បានចូលមកវិញ' : (data.status === 'approved' ? 'កំពុងនៅក្រៅ' : '');
                formattedData["ម៉ោងចូលវិញ"] = data.returnedAt || '';
            }
            dataToExport.push(formattedData);
        });

        if (dataToExport.length === 0) {
            // --- *** LOGGING START *** ---
            console.log("No data found for the selected criteria.");
            // --- *** LOGGING END *** ---
            throw new Error("រក​មិន​ឃើញ​ទិន្នន័យ​សម្រាប់​លក្ខខណ្ឌ​នេះ​ទេ។");
        }

        // --- *** LOGGING START *** ---
        console.log(`Found ${dataToExport.length} records to export.`);
        // console.log("Data prepared for Excel:", dataToExport); // Log data if needed, can be large
        // --- *** LOGGING END *** ---
        downloadStatus.textContent = 'កំពុង​បង្កើត​ឯកសារ Excel...';

        // --- បង្កើត Excel ដោយ​ប្រើ SheetJS ---
        // --- *** LOGGING START *** ---
        console.log("Checking if XLSX library is loaded:", typeof XLSX !== 'undefined');
        // --- *** LOGGING END *** ---
        if (typeof XLSX === 'undefined') {
             throw new Error("បណ្ណាល័យ Excel (XLSX) មិន​បាន​ផ្ទុក​ត្រឹមត្រូវ​ទេ។");
        }

        // 1. បង្កើត Worksheet
        console.log("Creating worksheet...");
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        console.log("Worksheet created.");

        // --- កំណត់ chiều rộng của cột (ស្រេចចិត្ត) ---
        const columnWidths = [
            { wch: 20 }, // ID ស្នើសុំ
            { wch: 12 }, // ID បុគ្គលិក
            { wch: 25 }, // ឈ្មោះ
            { wch: 20 }, // ផ្នែក
            { wch: 15 }, // រយៈពេល
            { wch: 30 }, // មូលហេតុ
            { wch: 12 }, // ថ្ងៃចាប់ផ្តើម
            { wch: 12 }, // ថ្ងៃបញ្ចប់
            { wch: 20 }, // ស្នើសុំនៅ
            { wch: 20 }, // អនុម័តនៅ
        ];
        if (type === 'out') {
            columnWidths.push({ wch: 15 }); // ស្ថានភាពចូលវិញ
            columnWidths.push({ wch: 20 }); // ម៉ោងចូលវិញ
        }
        ws['!cols'] = columnWidths;
        console.log("Column widths set.");


        // 2. បង្កើត Workbook ថ្មី
        console.log("Creating workbook...");
        const wb = XLSX.utils.book_new();
        console.log("Workbook created.");

        // 3. បញ្ចូល Worksheet ទៅ Workbook
        console.log("Appending sheet to workbook...");
        XLSX.utils.book_append_sheet(wb, ws, "Approved Requests"); // ตั้งชื่อ Sheet
        console.log("Sheet appended.");

        // 4. បង្កើត និង​ទាញ​យក​ឯកសារ Excel
        const fileName = `${fileNameBase}${fileNameSuffix}.xlsx`;
        // --- *** LOGGING START *** ---
        console.log(`Attempting to write and download file: ${fileName}`);
        // --- *** LOGGING END *** ---
        XLSX.writeFile(wb, fileName);
        // --- *** LOGGING START *** ---
        console.log("XLSX.writeFile executed.");
        // --- *** LOGGING END *** ---


        downloadStatus.textContent = 'ទាញយក​បាន​ជោគជ័យ!';
        downloadStatus.classList.remove('text-blue-500', 'text-red-500');
        downloadStatus.classList.add('text-green-500');

        // បិទ Modal បន្ទាប់ពីជោគជ័យ (ស្រេចចិត្ត)
        setTimeout(() => {
           // closeDownloadModal(); // អ្នកអាច uncomment វិញ បើចង់ឲ្យវាបិទស្វ័យប្រវត្តិ
           console.log("Download process finished successfully.");
        }, 1500); // Reduced timeout for faster feedback


    } catch (error) {
        console.error("Error during download:", error);
        downloadStatus.textContent = `Error: ${error.message}`;
        downloadStatus.classList.remove('text-blue-500', 'text-green-500');
        downloadStatus.classList.add('text-red-500');
    } finally {
        // អនុញ្ញាតឲ្យចុច Download វិញ
        isDownloading = false;
        downloadLeaveBtn.disabled = false;
        downloadOutBtn.disabled = false;
        // --- *** LOGGING START *** ---
        console.log("Download process finished (finally block). isDownloading set to false.");
        // --- *** LOGGING END *** ---
    }
}


// --- Helper Functions for Populating Selects ---
function populateMonthSelect(selectElement, defaultValue) {
    const months = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
    selectElement.innerHTML = ''; // Clear existing options
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index; // 0-11
        option.text = month;
        selectElement.add(option);
    });
    selectElement.value = defaultValue; // Set default
}

function populateYearSelect(selectElement, defaultValue) {
    const currentYr = new Date().getFullYear();
    const startYear = currentYr - 2; // Show previous 2 years
    const endYear = currentYr + 1;   // Show next 1 year
    selectElement.innerHTML = ''; // Clear existing options
    for (let year = startYear; year <= endYear; year++) {
         const option = document.createElement('option');
         option.value = year;
         option.text = year;
         selectElement.add(option);
    }
     addYearOptionIfNeeded(selectElement, defaultValue); // Make sure default year exists
    selectElement.value = defaultValue; // Set default
}

function addYearOptionIfNeeded(selectElement, year) {
     let yearExists = false;
    for (let i = 0; i < selectElement.options.length; i++) {
        if (selectElement.options[i].value == year) {
            yearExists = true;
            break;
        }
    }
    if (!yearExists) {
        const option = document.createElement('option');
        option.value = year;
        option.text = year;
        // Insert in sorted order or simply add (depending on preference)
        selectElement.add(option);
        // Optional: Sort options if needed
         Array.from(selectElement.options)
            .sort((a, b) => parseInt(a.value) - parseInt(b.value))
            .forEach(option => selectElement.add(option));
    }
}
File admin_app.js
