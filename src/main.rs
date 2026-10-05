fn main() {
    let x = 5;
    let y = 100;

    println!("x = {}, y = {}", x, y);
    println!("x + y = {}", x + y);

    for i in y..=x {
        println!("count = {}", i);
    }
}
