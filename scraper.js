const cheerio = require('cheerio');
const Telenode = require('telenode-js');
const fs = require('fs');
const config = require('./config.json');

const getYad2Response = async (url) => {
    const requestOptions = {
        method: 'GET',
        redirect: 'follow'
    };
    try {
        const res = await fetch(url, requestOptions)
        return await res.text()
    } catch (err) {
        console.log(err)
    }
}

const scrapeItemsAndExtractImgUrls = async (url) => {
    const yad2Html = await getYad2Response(url);
    if (!yad2Html) {
        throw new Error("Could not get Yad2 response");
    }
    const $ = cheerio.load(yad2Html);
    const title = $("title");
    const titleText = title.first().text();
    if (titleText === "ShieldSquare Captcha") {
        throw new Error("Bot detection");
    }

    // Select the items using the updated selector
    const $feedItems = $(
        "li[data-testid=\"item-basic\"]"
    );
    console.log("Number of feed items found:", $feedItems.length);

    if (!$feedItems) {
        throw new Error("Could not find feed items");
    }

    const imageUrls = [];
    $feedItems.each((_, elm) => {
        const imgSrc = "https://www.yad2.co.il" + $(elm)
            .find(
                "div > div > a"
            )
            .attr("href");
        if (imgSrc) {
            imageUrls.push(imgSrc);
            console.log(imgSrc);
        }
    });
    return imageUrls;
};


const checkIfHasNewItem = async (imgUrls, topic) => {
    const filePath = `./data/${topic}.json`;
    let savedUrls = [];
    try {
        // Try to load the existing file
        savedUrls = require(filePath);
    } catch (e) {
        console.log("here1");
        if (e.code === "MODULE_NOT_FOUND") {
            console.log("here1.5");
            try {
                // Ensure the directory exists
                if (!fs.existsSync('./data')) {
                    fs.mkdirSync('./data', { recursive: true });
                }
                // Create the file with an empty array
                fs.writeFileSync(filePath, JSON.stringify([]));
            } catch (err) {
                console.error(`Error creating directory or file: ${err.message}`);
                throw new Error(`Could not initialize ${filePath}`);
            }
        } else {
            console.error(e);
            throw new Error(`Could not read / create ${filePath}`);
        }
    }
    console.log("here2");
    let shouldUpdateFile = false;
    savedUrls = savedUrls.filter(savedUrl => {
        shouldUpdateFile = true;
        return imgUrls.includes(savedUrl);
    });
    console.log("here3");
    const newItems = [];
    imgUrls.forEach(url => {
        if (!savedUrls.includes(url)) {
            savedUrls.push(url);
            newItems.push(url);
            shouldUpdateFile = true;
        }
    });
        console.log("here4");
    if (shouldUpdateFile) {
        console.log("here5");
        const updatedUrls = JSON.stringify(savedUrls, null, 2);
        fs.writeFileSync(filePath, updatedUrls);
        await createPushFlagForWorkflow();
    }
    return newItems;
}

const createPushFlagForWorkflow = () => {
    fs.writeFileSync("push_me", "")
}

const scrape = async (topic, url) => {
    const apiToken = process.env.API_TOKEN;
    const chatId = process.env.CHAT_ID;
    const telenode = new Telenode({apiToken})
    try {
        //await telenode.sendTextMessage(`Starting scanning ${topic} on link:\n${url}`, chatId)
        const scrapeImgResults = await scrapeItemsAndExtractImgUrls(url);
            console.log("here7");

        const newItems = await checkIfHasNewItem(scrapeImgResults, topic);
                    console.log("here8");

        if (newItems.length > 0) {
                        console.log("here9");
            const newItemsJoined = newItems.join("\n----------\n");
            //const newItemsJoined = "https://img.yad2.co.il/Pic/202501/16/2_6/o/y2_1pa_010126_20250116010152.jpeg?w=3840&h=3840&c=9";
            const msg = `${newItems.length} new items:\n${newItemsJoined}`
                        console.log("here10");
            console.log(msg);
            console.log(chatId);
            await telenode.sendTextMessage(msg, chatId);
                        console.log("here11");

        } else {
            //await telenode.sendTextMessage("No new items were added", chatId);
        }
    } catch (e) {
        let errMsg = e?.message || "";
        if (errMsg) {
            errMsg = `Error: ${errMsg}`
        }
        await telenode.sendTextMessage(`Scan workflow failed... 😥\n${errMsg}`, chatId)
        throw new Error(e)
    }
}

const program = async () => {
    await Promise.all(config.projects.filter(project => {
        if (project.disabled) {
            console.log(`Topic "${project.topic}" is disabled. Skipping.`);
        }
        return !project.disabled;
    }).map(async project => {
        await scrape(project.topic, project.url)
    }))
};

program();
